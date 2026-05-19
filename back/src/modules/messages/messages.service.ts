import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Message } from '../../database/schemas/message.schema';
import { Chat } from '../../database/schemas/chat.schema';
import { ChatSession } from '../../database/schemas/chat-session.schema';
import { normalizeTelegramDate, calculateDiffMinutes } from '../../utils/date.util';

@Injectable()
export class MessagesService {
  private readonly logger = new Logger(MessagesService.name);

  constructor(
    @InjectModel(Message.name) private messageModel: Model<Message>,
    @InjectModel(Chat.name) private chatModel: Model<Chat>,
    @InjectModel(ChatSession.name) private chatSessionModel: Model<ChatSession>,
  ) {}

  async findOrCreateChat(userId: string, tgChat: any) {
    const externalId = (tgChat.id || tgChat.externalId)?.toString();
    if (!externalId) throw new Error('Chat ID not found in Telegram data');
    
    let chat = await this.chatModel.findOne({ userId: new Types.ObjectId(userId), externalId } as any);

    if (!chat) {
      chat = await this.chatModel.create({
        userId: new Types.ObjectId(userId) as any,
        externalId,
        title: tgChat.title || tgChat.firstName || 'Unknown Chat',
        type: this.getChatType(tgChat),
        metadata: tgChat,
      });
    }
    return chat;
  }

  async getOrCreateActiveSession(
    userId: string,
    chatId: string,
    messageTimestamp: Date,
    chatType: string,
    senderName?: string
  ): Promise<Types.ObjectId> {
    // Ensure the messageTimestamp is a valid Javascript Date object
    const normalizedMsgTime = normalizeTelegramDate(messageTimestamp);

    // Find the latest active session for this chat
    let session = await this.chatSessionModel.findOne({
      userId: new Types.ObjectId(userId),
      chatId: new Types.ObjectId(chatId),
      status: 'active',
    } as any).sort({ lastMessageAt: -1 }).exec();

    // Determine the timeout: private = 20 min, group/channel = 7 min
    const timeoutMinutes = chatType === 'private' ? 20 : 7;
    const timeoutMs = timeoutMinutes * 60 * 1000;

    if (session) {
      const lastMsgTime = normalizeTelegramDate(session.lastMessageAt);
      const diffMs = Math.abs(normalizedMsgTime.getTime() - lastMsgTime.getTime());
      const diffMinutes = diffMs / (60 * 1000);

      this.logger.debug(
        `[SessionBuilder] Time difference calculation: ` +
        JSON.stringify({
          sessionId: session._id,
          now: new Date().toISOString(),
          messageTimestamp: normalizedMsgTime.toISOString(),
          lastMessageAt: lastMsgTime.toISOString(),
          diffMs,
          diffMinutes,
          timeoutMinutes,
        })
      );

      if (diffMs <= timeoutMs) {
        // Append to existing active session
        session.lastMessageAt = normalizedMsgTime;
        if (normalizedMsgTime > session.endedAt) {
          session.endedAt = normalizedMsgTime;
        }
        if (normalizedMsgTime < session.startedAt) {
          session.startedAt = normalizedMsgTime;
        }
        session.messageCount += 1;
        if (senderName && !session.participants.includes(senderName)) {
          session.participants.push(senderName);
        }
        session.metadata = {
          chatType,
          totalMessages: session.messageCount,
          totalCharacters: (session.metadata?.totalCharacters || 0) + 1,
        };
        await session.save();
        return session._id as any;
      } else {
        // Close the old session
        this.logger.log(`[SessionBuilder] Inactivity timeout of ${timeoutMinutes}m exceeded (${diffMinutes.toFixed(1)}m elapsed). Closing session ${session._id}.`);
        session.status = 'closed';
        await session.save();
      }
    }

    // Create a new active session
    const newSession = await this.chatSessionModel.create({
      userId: new Types.ObjectId(userId),
      chatId: new Types.ObjectId(chatId),
      startedAt: normalizedMsgTime,
      endedAt: normalizedMsgTime,
      lastMessageAt: normalizedMsgTime,
      messageCount: 1,
      participants: senderName ? [senderName] : [],
      status: 'active',
      aiProcessed: false,
      importanceScore: 0,
      topics: [],
      metadata: {
        chatType,
        totalMessages: 1,
        totalCharacters: 0,
      },
    });

    this.logger.log(`[SessionBuilder] Created new ACTIVE session ${newSession._id} for chat ${chatId} starting at ${normalizedMsgTime.toISOString()}`);
    return newSession._id as any;
  }

  async saveMessage(userId: string, chatId: string, tgMsg: any): Promise<Message | null> {
    const chat = await this.chatModel.findById(chatId).exec();
    const chatType = chat ? chat.type : 'group';
    const timestamp = normalizeTelegramDate(tgMsg.date);
    const senderName = tgMsg._sender?.firstName || 'Unknown';

    const sessionId = await this.getOrCreateActiveSession(
      userId,
      chatId,
      timestamp,
      chatType,
      senderName
    );

    const content = tgMsg.message || '';
    const charCount = content.length;

    await this.chatSessionModel.updateOne(
      { _id: sessionId },
      { $inc: { 'metadata.totalCharacters': charCount } }
    ).exec();

    const filter: any = { userId: new Types.ObjectId(userId), chatId: new Types.ObjectId(chatId), externalId: tgMsg.id };
    return this.messageModel.findOneAndUpdate(
      filter,
      {
        userId: new Types.ObjectId(userId) as any,
        chatId: new Types.ObjectId(chatId) as any,
        sessionId,
        externalId: tgMsg.id,
        content,
        timestamp,
        sender: {
          id: tgMsg.senderId?.toString(),
          name: senderName,
          username: tgMsg._sender?.username,
        },
      },
      { upsert: true, returnDocument: 'after' }
    ).exec();
  }

  async bulkSaveMessages(userId: string, chatId: string, tgMsgs: any[]): Promise<void> {
    if (!tgMsgs.length) return;

    const chat = await this.chatModel.findById(chatId).exec();
    const chatType = chat ? chat.type : 'group';

    // Sort messages chronologically to ensure correct session grouping
    const sortedMsgs = [...tgMsgs].sort((a, b) => a.date - b.date);

    const operations: any[] = [];

    for (const tgMsg of sortedMsgs) {
      const timestamp = normalizeTelegramDate(tgMsg.date);
      const senderName = tgMsg._sender?.firstName || 'Unknown';

      const sessionId = await this.getOrCreateActiveSession(
        userId,
        chatId,
        timestamp,
        chatType,
        senderName
      );

      const content = tgMsg.message || '';
      const charCount = content.length;

      await this.chatSessionModel.updateOne(
        { _id: sessionId },
        { $inc: { 'metadata.totalCharacters': charCount } }
      ).exec();

      operations.push({
        updateOne: {
          filter: { userId: new Types.ObjectId(userId), chatId: new Types.ObjectId(chatId), externalId: tgMsg.id },
          update: {
            $set: {
              userId: new Types.ObjectId(userId),
              chatId: new Types.ObjectId(chatId),
              sessionId,
              externalId: tgMsg.id,
              content,
              timestamp,
              sender: {
                id: tgMsg.senderId?.toString(),
                name: senderName,
                username: tgMsg._sender?.username,
              },
            }
          },
          upsert: true
        }
      });
    }

    if (operations.length > 0) {
      await this.messageModel.bulkWrite(operations as any);
    }
  }

  private getChatType(tgChat: any): string {
    if (tgChat.className === 'User') return 'private';
    if (tgChat.broadcast) return 'channel';
    return 'group';
  }
}

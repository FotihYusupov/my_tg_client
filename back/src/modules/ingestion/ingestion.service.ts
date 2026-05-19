import { Injectable, Logger, Inject, forwardRef, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { TelegramService } from '../telegram/telegram.service';
import { MessagesService } from '../messages/messages.service';
import { AiService } from '../ai/ai.service';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Message } from '../../database/schemas/message.schema';
import { Chat } from '../../database/schemas/chat.schema';
import { ChatSession } from '../../database/schemas/chat-session.schema';
import { QdrantService } from '../search/qdrant.service';
import { UsersService } from '../users/users.service';
import { QueueService } from '../queue/queue.service';
import { normalizeTelegramDate } from '../../utils/date.util';

@Injectable()
export class IngestionService implements OnApplicationBootstrap {
  private readonly logger = new Logger(IngestionService.name);
  private syncInProgress = new Set<string>();

  constructor(
    @Inject(forwardRef(() => TelegramService))
    private telegramService: TelegramService,
    private messagesService: MessagesService,
    private aiService: AiService,
    private qdrantService: QdrantService,
    @InjectModel(Message.name) private messageModel: Model<Message>,
    @InjectModel(Chat.name) private chatModel: Model<Chat>,
    @InjectModel(ChatSession.name) private chatSessionModel: Model<ChatSession>,
    private usersService: UsersService,
    @Inject(forwardRef(() => QueueService))
    private queueService: QueueService,
  ) {}

  async onApplicationBootstrap() {
    try {
      await this.runStartupRecovery();
    } catch (err) {
      this.logger.error(`[StartupRecovery] Failed to run startup recovery routine: ${err.message}`);
    }
  }

  // ==================================================
  // STARTUP RECOVERY & AUTO-CLOSE
  // ==================================================
  async runStartupRecovery() {
    this.logger.log('[StartupRecovery] Starting startup recovery routine...');
    
    // 1. Auto-close historical ACTIVE sessions older than 24 hours
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const staleActiveResult = await this.chatSessionModel.updateMany(
      { status: 'active', lastMessageAt: { $lt: oneDayAgo } } as any,
      { $set: { status: 'closed' } }
    ).exec();
    
    if (staleActiveResult.modifiedCount > 0) {
      this.logger.log(`[StartupRecovery] Auto-closed ${staleActiveResult.modifiedCount} stale ACTIVE sessions older than 24 hours.`);
    }

    // 2. Recover stuck PROCESSING sessions
    const stuckResult = await this.chatSessionModel.updateMany(
      { status: 'processing', updatedAt: { $lt: new Date(Date.now() - 60 * 60 * 1000) } } as any,
      { $set: { status: 'closed', aiProcessed: false } }
    ).exec();

    if (stuckResult.modifiedCount > 0) {
      this.logger.log(`[StartupRecovery] Recovered ${stuckResult.modifiedCount} stuck PROCESSING sessions back to closed.`);
    }
    
    // 3. Reconnect Telegram listeners
    this.logger.log('[StartupRecovery] Reconnecting active Telegram listeners...');
    const users = await this.usersService.findAllWithSession();
    for (const user of users) {
      try {
        this.telegramService.getClientForUser(user._id.toString()).catch(() => {});
      } catch (err) {
        this.logger.error(`[StartupRecovery] Failed to reconnect Telegram client for user ${user._id}: ${err.message}`);
      }
    }
  }

  // ==================================================
  // SCHEDULER MANAGEMENT & SCANNER
  // ==================================================
  @Cron(CronExpression.EVERY_5_MINUTES)
  async handleSessionManagement() {
    this.logger.log('[SessionManager] Running session timeout checker cycle...');
    try {
      await this.closeTimedOutSessions();
    } catch (err) {
      this.logger.error(`[SessionManager] Error closing timed-out sessions: ${err.message}`);
    }
  }

  @Cron('0 */3 * * * *')
  async handleQueueScanner() {
    this.logger.log('[QueueScanner] Scanning for CLOSED, unprocessed sessions to enqueue...');
    
    const closedSessions = await this.chatSessionModel.find({
      status: 'closed',
      aiProcessed: false
    }).exec();

    if (closedSessions.length === 0) return;

    this.logger.log(`[QueueScanner] Found ${closedSessions.length} closed sessions to enqueue for AI analysis.`);

    for (const session of closedSessions) {
      try {
        await this.queueService.enqueue('session-ai-analysis', session._id.toString());
      } catch (err) {
        this.logger.error(`[QueueScanner] Failed to enqueue session ${session._id} for AI analysis: ${err.message}`);
      }
    }
  }

  // ==================================================
  // WORKER BUSINESS LOGIC PIPELINES
  // ==================================================
  async processSessionWithAiById(sessionId: string): Promise<void> {
    const session = await this.chatSessionModel.findById(sessionId).exec();
    if (!session) {
      throw new Error(`Session ${sessionId} not found in database`);
    }
    await this.processSessionWithAi(session);
  }

  async processSessionEmbeddingById(sessionId: string): Promise<void> {
    const session = await this.chatSessionModel.findById(sessionId).exec();
    if (!session) {
      throw new Error(`Session ${sessionId} not found in database`);
    }

    if (!session.summary) {
      throw new Error(`Session ${sessionId} contains no AI summary to generate embedding for`);
    }

    this.logger.log(`Generating vector embedding for session summary ${session._id}...`);
    const embedding = await this.aiService.getEmbedding(session.summary);

    if (!embedding || embedding.length === 0) {
      throw new Error('Generated embedding from AI service was empty');
    }

    await this.qdrantService.upsertMessage(
      (session._id as any).toString(),
      session.userId.toString(),
      embedding,
      {
        content: session.summary,
        timestamp: session.endedAt.toISOString(),
        sender: { id: 'AI', name: 'Session Summary' },
        aiMetadata: {
          importance: session.importanceScore,
          category: 'conversation',
          summary: session.summary,
        }
      }
    );

    session.status = 'completed';
    await session.save();
  }

  private async processSessionWithAi(session: ChatSession) {
    this.logger.log(`[AIWorker] Compiling optimized payload for session ${session._id}...`);

    const messages = await this.messageModel.find({
      sessionId: session._id
    }).sort({ timestamp: 1 }).exec();

    // Filter chitchat, stickers, and reactions deterministic noise
    const isMeaningless = (content: string): boolean => {
      if (!content || content.trim().length < 3) return true;
      const noisePatterns = [
        /^(ok|okay|hop|ha|hah|haha|lol|lmao|tnx|thanks|ty|vse|bo’ldi|yaxshi|tushunarli)$/i,
        /^[👋🤝👍👎👊✌️👌✨🔥💯❤️😂🙏]+$/u,
        /^(salom|assalomu alaykum|qalaysiz|hi|hello|hey|privet)$/i,
        /^(da|yo'q|yoq|ha|hm|okey|yep|nope)$/i,
      ];
      return noisePatterns.some(pattern => pattern.test(content.trim()));
    };

    const meaningfulMessages = messages.filter(m => !isMeaningless(m.content));

    if (meaningfulMessages.length === 0) {
      this.logger.log(`[AIWorker] Session ${session._id} contains no meaningful messages. Skipping AI enrich.`);
      session.aiProcessed = true;
      session.importanceScore = 0;
      session.summary = 'No meaningful conversation content.';
      session.status = 'completed';
      await session.save();

      await this.messageModel.updateMany(
        { sessionId: session._id } as any,
        { $set: { 'aiMetadata.isProcessed': true } }
      ).exec();
      return;
    }

    const chat = await this.chatModel.findById(session.chatId).exec();
    const chatType = chat ? chat.type : 'group';
    const durationMinutes = Math.round((session.endedAt.getTime() - session.startedAt.getTime()) / 60000);

    const MAX_MESSAGES_PER_CHUNK = 80;
    const totalMessages = meaningfulMessages.length;
    let analysis;

    if (totalMessages <= MAX_MESSAGES_PER_CHUNK) {
      const formattedMessages = meaningfulMessages.map(m => ({
        sender: m.sender.name || 'Unknown',
        senderId: m.sender.id,
        content: m.content,
        timestamp: m.timestamp.toISOString()
      }));

      const payload = {
        sessionInfo: {
          startedAt: session.startedAt.toISOString(),
          endedAt: session.endedAt.toISOString(),
          durationMinutes: durationMinutes,
          participants: session.participants,
          messageCount: session.messageCount,
          chatType: chatType
        },
        messages: formattedMessages
      };

      analysis = await this.aiService.analyzeSession(payload);
    } else {
      this.logger.log(`[AIWorker] Session ${session._id} contains ${totalMessages} messages. Splitting into semantic chunks...`);
      
      const chunks: any[][] = [];
      for (let i = 0; i < totalMessages; i += MAX_MESSAGES_PER_CHUNK) {
        chunks.push(meaningfulMessages.slice(i, i + MAX_MESSAGES_PER_CHUNK));
      }

      this.logger.log(`[AIWorker] Split session ${session._id} into ${chunks.length} chunks.`);
      
      const chunkSummaries: string[] = [];
      const topicsSet = new Set<string>();
      let maxImportance = 0;

      for (let j = 0; j < chunks.length; j++) {
        const chunk = chunks[j];
        const chunkFormatted = chunk.map(m => ({
          sender: m.sender.name || 'Unknown',
          senderId: m.sender.id,
          content: m.content,
          timestamp: m.timestamp.toISOString()
        }));

        const chunkPayload = {
          sessionInfo: {
            startedAt: chunk[0].timestamp.toISOString(),
            endedAt: chunk[chunk.length - 1].timestamp.toISOString(),
            durationMinutes: Math.round((chunk[chunk.length - 1].timestamp.getTime() - chunk[0].timestamp.getTime()) / 60000),
            participants: session.participants,
            messageCount: chunk.length,
            chatType
          },
          messages: chunkFormatted
        };

        const chunkAnalysis = await this.aiService.analyzeSession(chunkPayload);
        chunkSummaries.push(`[Chunk ${j + 1}/${chunks.length}]: ${chunkAnalysis.summary}`);
        chunkAnalysis.topics.forEach(t => topicsSet.add(t));
        if (chunkAnalysis.importanceScore > maxImportance) {
          maxImportance = chunkAnalysis.importanceScore;
        }
      }

      // Synthesize chunk summaries
      const synthesisPrompt = `
        Synthesize the following conversation chunk summaries into one clean, cohesive, and comprehensive summary in English.
        
        CHUNK SUMMARIES:
        ${chunkSummaries.join('\n\n')}
        
        Provide only a JSON response in this exact format:
        {
          "shouldStore": true,
          "importanceScore": ${maxImportance},
          "topics": ${JSON.stringify(Array.from(topicsSet))},
          "summary": "comprehensive synthesized summary of the entire session",
          "reason": "synthesized multiple chunks"
        }
      `;

      try {
        const synthesizedResult = await this.aiService.generateCompletion(synthesisPrompt);
        const parsed = JSON.parse(synthesizedResult);
        analysis = {
          shouldStore: !!parsed.shouldStore,
          importanceScore: parsed.importanceScore || maxImportance,
          topics: parsed.topics || Array.from(topicsSet),
          summary: parsed.summary || chunkSummaries.join(' '),
          reason: parsed.reason || 'Synthesized multiple chunks'
        };
      } catch (err) {
        this.logger.warn(`[AIWorker] Chunk synthesis failed, falling back: ${err.message}`);
        analysis = {
          shouldStore: maxImportance > 0.45,
          importanceScore: maxImportance,
          topics: Array.from(topicsSet),
          summary: chunkSummaries.join(' | '),
          reason: 'Synthesis failed, showing chunk summaries'
        };
      }
    }

    session.aiProcessed = true;
    session.importanceScore = analysis.importanceScore;
    session.topics = analysis.topics;
    session.summary = analysis.summary;
    await session.save();

    await this.messageModel.updateMany(
      { sessionId: session._id } as any,
      {
        $set: {
          'aiMetadata.isProcessed': true,
          'aiMetadata.importance': analysis.importanceScore,
          'aiMetadata.category': 'conversation',
          'aiMetadata.summary': analysis.summary
        }
      }
    ).exec();

    // Check if embedding required
    const needsEmbedding = this.shouldGenerateEmbedding(session, analysis.importanceScore);

    if (needsEmbedding) {
      this.logger.log(`[AIWorker] Session ${session._id} requires vector embedding (Score: ${analysis.importanceScore} >= 0.85). Enqueuing embedding job.`);
      await this.queueService.enqueue('embedding-generation', session._id.toString());
    } else {
      this.logger.log(`[AIWorker] Session ${session._id} does not require vector embedding (Score: ${analysis.importanceScore} < 0.85). Marking as completed.`);
      session.status = 'completed';
      await session.save();
    }
  }

  private shouldGenerateEmbedding(session: any, importanceScore: number): boolean {
    if (importanceScore < 0.85) return false;
    if (session.messageCount < 3) return false;
    
    const totalChars = session.metadata?.totalCharacters || 0;
    if (totalChars < 50) return false;

    if (!session.summary || session.summary === 'No meaningful conversation content.' || session.summary === 'Summary unavailable') {
      return false;
    }

    return true;
  }

  // ==================================================
  // INACTIVITY TIMEOUT RESOLUTION
  // ==================================================
  async closeTimedOutSessions() {
    this.logger.log('[SessionManager] Checking for timed-out active sessions...');
    const activeSessions = await this.chatSessionModel.find({ status: 'active' }).populate('chatId').exec();
    
    const now = new Date();
    let closedCount = 0;

    for (const session of activeSessions) {
      const chat = session.chatId as any;
      const chatType = chat ? chat.type : 'group';

      const timeoutMinutes = chatType === 'private' ? 20 : 7;
      const timeoutMs = timeoutMinutes * 60 * 1000;

      const normalizedLastMessage = normalizeTelegramDate(session.lastMessageAt);
      const diffMs = Math.abs(now.getTime() - normalizedLastMessage.getTime());
      const diffMinutes = diffMs / (60 * 1000);

      this.logger.debug(
        `[SessionManager] Timeout evaluation: ` +
        JSON.stringify({
          sessionId: session._id,
          diffMinutes,
          timeoutMinutes,
        })
      );

      if (diffMs > timeoutMs) {
        session.status = 'closed';
        await session.save();
        closedCount++;
        this.logger.log(`[SessionManager] Closed timed-out active session ${session._id} for chat "${chat?.title || chat?._id}" (Inactive for ${diffMinutes.toFixed(1)} mins)`);
      }
    }

    if (closedCount > 0) {
      this.logger.log(`[SessionManager] Closed ${closedCount} timed-out active session(s).`);
    }
  }

  // ==================================================
  // TELEGRAM INTEGRATION & SYNC PIPELINES (DECOUPLED SOCKETS)
  // ==================================================
  @Cron(CronExpression.EVERY_10_MINUTES)
  async handleIncrementalSync() {
    this.logger.log('[IngestionService] Starting incremental sync for all users...');
    const users = await this.usersService.findAllWithSession();
    
    for (const user of users) {
      const monitoredChats = await this.chatModel.find({ 
        userId: user._id, 
        isMonitored: true 
      } as any);

      if (monitoredChats.length === 0) continue;

      const chatIds = monitoredChats.map(c => c.externalId);
      this.logger.log(`[IngestionService] Auto-syncing ${chatIds.length} chats for user ${user._id}`);
      
      this.triggerHistorySync(user._id.toString(), chatIds);
    }
  }

  @Cron(CronExpression.EVERY_HOUR)
  async handleHourlyChatRefresh() {
    this.logger.log('[IngestionService] Starting hourly chat list refresh for all users...');
    const users = await this.usersService.findAllWithSession();
    
    for (const user of users) {
      try {
        await this.refreshTelegramChats(user._id.toString());
      } catch (error) {
        this.logger.error(`[IngestionService] Failed to refresh chats for user ${user._id}: ${error.message}`);
      }
    }
  }

  async refreshTelegramChats(userId: string) {
    this.logger.log(`[IngestionService] Refreshing chat list from Telegram for user ${userId}`);
    const client = await this.telegramService.getApiClientForUser(userId);
    try {
      const dialogs = await this.telegramService.getDialogs(client);
      
      const bulkOps = dialogs.map(d => {
        const externalId = d.id?.toString();
        const entity = d.entity as any;
        let type = 'group';
        if (d.entity?.className === 'User') type = 'private';
        else if (entity?.broadcast) type = 'channel';

        return {
          updateOne: {
            filter: { userId: new Types.ObjectId(userId), externalId },
            update: { 
              $set: { 
                title: d.title || 'Unknown',
                type,
                metadata: {
                  accessHash: entity?.accessHash?.toString(),
                  username: entity?.username
                }
              }
            },
            upsert: true
          }
        };
      });

      if (bulkOps.length > 0) {
        await this.chatModel.bulkWrite(bulkOps as any);
      }
      
      this.logger.log(`[IngestionService] Updated ${bulkOps.length} chats for user ${userId}`);
    } finally {
      try {
        await client.disconnect();
      } catch (e) {}
    }
  }

  isSyncing(userId: string): boolean {
    return this.syncInProgress.has(userId);
  }

  async getTelegramChats(userId: string, forceRefresh = false, page = 1, limit = 20) {
    if (forceRefresh) {
      await this.refreshTelegramChats(userId);
    }
    
    const skip = (page - 1) * limit;
    
    const dbChats = await this.chatModel.find({ userId: new Types.ObjectId(userId) } as any)
      .sort({ isMonitored: -1, title: 1 })
      .skip(skip)
      .limit(limit)
      .exec();
      
    const total = await this.chatModel.countDocuments({ userId: new Types.ObjectId(userId) } as any);
    
    if (!forceRefresh && dbChats.length === 0 && page === 1) {
      await this.refreshTelegramChats(userId);
      return this.getTelegramChats(userId, false, page, limit);
    }

    const items = dbChats.map(c => ({
      id: c.externalId,
      title: c.title,
      type: c.type,
      isMonitored: c.isMonitored,
      category: c.category,
    }));

    return {
      items,
      total,
      page,
      limit,
      hasMore: skip + dbChats.length < total
    };
  }

  async updateChatSettings(userId: string, externalChatId: string, settings: { category?: string, isMonitored?: boolean }) {
    const updated = await this.chatModel.findOneAndUpdate(
      { userId: new Types.ObjectId(userId), externalId: externalChatId } as any,
      { $set: settings },
      { returnDocument: 'after' }
    );

    if (updated) return updated;

    const client = await this.telegramService.getApiClientForUser(userId);
    try {
      const entity = await client.getEntity(externalChatId);
      const chat = await this.messagesService.findOrCreateChat(userId, entity);
      
      return await this.chatModel.findByIdAndUpdate(
        chat._id,
        { $set: settings },
        { returnDocument: 'after' }
      );
    } finally {
      try {
        await client.disconnect();
      } catch (e) {}
    }
  }

  async triggerHistorySync(userId: string, chatIds?: string[], options?: { startDate?: Date; endDate?: Date }) {
    if (this.syncInProgress.has(userId)) {
      this.logger.warn(`[IngestionService] Sync already in progress for user: ${userId}`);
      return;
    }

    this.logger.log(
      `[IngestionService] Starting history sync for user: ${userId}, selective: ${!!chatIds}` +
      (options?.startDate || options?.endDate
        ? `, period range: ${options.startDate?.toISOString() || 'Any'} to ${options.endDate?.toISOString() || 'Any'}`
        : '')
    );
    this.syncInProgress.add(userId);

    this.runSync(userId, chatIds, options).catch(err => {
      this.logger.error(`[IngestionService] Background sync failed for user ${userId}: ${err.message}`);
    }).finally(() => {
      this.syncInProgress.delete(userId);
    });
  }

  private async runSync(userId: string, chatIds?: string[], options?: { startDate?: Date; endDate?: Date }) {
    const client = await this.telegramService.getApiClientForUser(userId);
    
    try {
      let dialogs = await this.telegramService.getDialogs(client);
      
      if (chatIds && chatIds.length > 0) {
        dialogs = dialogs.filter(d => {
          const id = d.id?.toString();
          return id && chatIds.includes(id);
        });
      }

      this.logger.log(`[IngestionService] Processing ${dialogs.length} dialogs for user: ${userId}`);

      for (const dialog of dialogs) {
        if (!dialog.id) continue;
        const chat = await this.messagesService.findOrCreateChat(userId, dialog.entity);
        await this.syncChatHistory(userId, (chat._id as any).toString(), dialog.id.toString(), client, options);
      }
    } finally {
      await new Promise(resolve => setTimeout(resolve, 1000));
      try {
        await client.disconnect();
      } catch (err) {
        this.logger.warn(`[IngestionService] Error during client disconnect: ${err.message}`);
      }
    }
  }

  private async syncChatHistory(
    userId: string,
    internalChatId: string,
    externalChatId: string,
    client: any,
    options?: { startDate?: Date; endDate?: Date }
  ) {
    let offsetId = 0;
    this.logger.log(
      `[IngestionService] Syncing chat history for: ${externalChatId}` +
      (options?.startDate || options?.endDate
        ? ` (Period limit: ${options.startDate?.toISOString() || 'Any'} to ${options.endDate?.toISOString() || 'Any'})`
        : '')
    );

    const startMs = options?.startDate ? new Date(options.startDate).getTime() : null;
    const endMs = options?.endDate ? new Date(options.endDate).getTime() : null;

    try {
      while (client.connected) {
        const messages = await this.telegramService.getMessages(client, externalChatId, {
          limit: 100,
          offsetId: offsetId,
        });

        if (!messages || messages.length === 0) break;

        const filteredMessages: any[] = [];
        let hitBeforeStart = false;

        for (const msg of messages) {
          const msgDate = new Date(msg.date * 1000);
          const msgMs = msgDate.getTime();

          if (endMs !== null && msgMs > endMs) {
            continue;
          }

          if (startMs !== null && msgMs < startMs) {
            hitBeforeStart = true;
            break;
          }

          filteredMessages.push(msg);
        }

        if (filteredMessages.length > 0) {
          await this.messagesService.bulkSaveMessages(userId, internalChatId, filteredMessages);
          this.logger.log(`[IngestionService] Saved ${filteredMessages.length} messages within target period for ${externalChatId}.`);
        }

        if (hitBeforeStart || messages.length < 100) {
          this.logger.log(`[IngestionService] Period lower bound crossed or chat history fully read for: ${externalChatId}`);
          break;
        }

        const newOffsetId = messages[messages.length - 1].id;
        if (newOffsetId === offsetId) break;
        offsetId = newOffsetId;
        
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        if (!client.connected) {
          this.logger.warn(`[IngestionService] Client disconnected during sync for chat: ${externalChatId}`);
          break;
        }
      }
    } catch (error) {
      this.logger.error(`[IngestionService] Failed to sync chat ${externalChatId}: ${error.message}`);
    }
  }
}

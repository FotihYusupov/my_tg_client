import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Message, MessageSchema } from '../../database/schemas/message.schema';
import { Chat, ChatSchema } from '../../database/schemas/chat.schema';
import { ChatSession, ChatSessionSchema } from '../../database/schemas/chat-session.schema';
import { MessagesService } from './messages.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Message.name, schema: MessageSchema },
      { name: Chat.name, schema: ChatSchema },
      { name: ChatSession.name, schema: ChatSessionSchema },
    ]),
  ],
  providers: [MessagesService],
  exports: [MessagesService],
})
export class MessagesModule {}

import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { IngestionService } from './ingestion.service';
import { TelegramModule } from '../telegram/telegram.module';
import { MessagesModule } from '../messages/messages.module';
import { UsersModule } from '../users/users.module';
import { AiModule as AiRootModule } from '../ai/ai.module';
import { Message, MessageSchema } from '../../database/schemas/message.schema';
import { Chat, ChatSchema } from '../../database/schemas/chat.schema';
import { ChatSession, ChatSessionSchema } from '../../database/schemas/chat-session.schema';
import { QueueJob, QueueJobSchema } from '../../database/schemas/queue-job.schema';
import { IngestionController } from './ingestion.controller';
import { SearchModule } from '../search/search.module';
import { QueueModule } from '../queue/queue.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Message.name, schema: MessageSchema },
      { name: Chat.name, schema: ChatSchema },
      { name: ChatSession.name, schema: ChatSessionSchema },
      { name: QueueJob.name, schema: QueueJobSchema },
    ]),
    forwardRef(() => TelegramModule),
    forwardRef(() => QueueModule),
    MessagesModule,
    UsersModule,
    AiRootModule,
    SearchModule,
  ],
  providers: [IngestionService],
  controllers: [IngestionController],
  exports: [IngestionService],
})
export class IngestionModule {}

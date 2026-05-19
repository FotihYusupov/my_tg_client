import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { QueueService } from './queue.service';
import { QueueJob, QueueJobSchema } from '../../database/schemas/queue-job.schema';
import { ChatSession, ChatSessionSchema } from '../../database/schemas/chat-session.schema';
import { IngestionModule } from '../ingestion/ingestion.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: QueueJob.name, schema: QueueJobSchema },
      { name: ChatSession.name, schema: ChatSessionSchema },
    ]),
    forwardRef(() => IngestionModule),
  ],
  providers: [QueueService],
  exports: [QueueService],
})
export class QueueModule {}

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Message, MessageSchema } from '../../database/schemas/message.schema';
import { SearchService } from './search.service';
import { SearchController } from './search.controller';
import { AiModule } from '../ai/ai.module';
import { QdrantService } from './qdrant.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Message.name, schema: MessageSchema }]),
    AiModule,
  ],
  providers: [SearchService, QdrantService],
  controllers: [SearchController],
  exports: [QdrantService],
})
export class SearchModule {}

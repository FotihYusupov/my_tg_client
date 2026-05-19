import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TelegramService } from './telegram.service';
import { TelegramController } from './telegram.controller';
import { UsersModule } from '../users/users.module';
import { IngestionModule } from '../ingestion/ingestion.module';
import { MessagesModule } from '../messages/messages.module';

@Module({
  imports: [
    ConfigModule, 
    UsersModule,
    forwardRef(() => IngestionModule),
    MessagesModule,
  ],
  controllers: [TelegramController],
  providers: [TelegramService],
  exports: [TelegramService],
})
export class TelegramModule {}

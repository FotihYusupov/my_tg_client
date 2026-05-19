import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { CacheModule } from '@nestjs/cache-manager';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { TelegramModule } from './modules/telegram/telegram.module';
import { MessagesModule } from './modules/messages/messages.module';
import { IngestionModule } from './modules/ingestion/ingestion.module';
import { SearchModule } from './modules/search/search.module';
import { QueueModule } from './modules/queue/queue.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ScheduleModule.forRoot(),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => ({
        uri: configService.get<string>('MONGO_URI') || 'mongodb://localhost:27017/second_brain',
      }),
    }),
    CacheModule.register({
      isGlobal: true,
      ttl: 600, // 10 minutes
    }),
    AuthModule,
    UsersModule,
    TelegramModule,
    MessagesModule,
    IngestionModule,
    SearchModule,
    QueueModule,
  ],
})
export class AppModule { }

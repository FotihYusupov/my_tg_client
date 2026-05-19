import { Controller, Get, Post, UseGuards, Request, Query, Req, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Message } from '../../database/schemas/message.schema';
import { Chat } from '../../database/schemas/chat.schema';
import { IngestionService } from './ingestion.service';

@Controller('ingestion')
@UseGuards(JwtAuthGuard)
export class IngestionController {
  constructor(
    @InjectModel(Message.name) private messageModel: Model<Message>,
    @InjectModel(Chat.name) private chatModel: Model<Chat>,
    private ingestionService: IngestionService,
  ) {}

  @Post('trigger')
  async triggerSync(@Request() req) {
    const { chatIds, startDate, endDate } = req.body;
    
    let parsedStartDate: Date | undefined;
    let parsedEndDate: Date | undefined;
    
    if (startDate) {
      parsedStartDate = new Date(startDate);
      if (isNaN(parsedStartDate.getTime())) {
        throw new BadRequestException('Invalid startDate format');
      }
    }
    
    if (endDate) {
      parsedEndDate = new Date(endDate);
      if (isNaN(parsedEndDate.getTime())) {
        throw new BadRequestException('Invalid endDate format');
      }
    }

    await this.ingestionService.triggerHistorySync(req.user.userId, chatIds, {
      startDate: parsedStartDate,
      endDate: parsedEndDate,
    });
    return { success: true };
  }

  @Get('get-chats')
  async getChats(
    @Req() req: any,
    @Query('forceRefresh') forceRefresh?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string
  ) {
    const parsedPage = page ? parseInt(page, 10) : 1;
    const parsedLimit = limit ? parseInt(limit, 10) : 20;
    return this.ingestionService.getTelegramChats(
      req.user.userId,
      forceRefresh === 'true',
      parsedPage,
      parsedLimit
    );
  }

  @Post('update-chat')
  async updateChat(@Request() req) {
    const { chatId, category, isMonitored } = req.body;
    return this.ingestionService.updateChatSettings(req.user.userId, chatId, { category, isMonitored });
  }

  @Post('enrich')
  async triggerEnrichment() {
    // This triggers the session closing and AI analysis task manually
    await this.ingestionService.handleSessionManagement();
    return { success: true };
  }

  @Get('status')
  async getStatus(@Request() req) {
    const userId = req.user.userId;
    
    const [messageCount, chatCount, processedCount] = await Promise.all([
      this.messageModel.countDocuments({ userId }),
      this.chatModel.countDocuments({ userId }),
      this.messageModel.countDocuments({ userId, 'aiMetadata.isProcessed': true }),
    ]);

    return {
      messageCount,
      chatCount,
      processedCount,
      isSyncing: this.ingestionService.isSyncing(userId),
    };
  }
}

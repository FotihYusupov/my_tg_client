import { Controller, Post, Get, Body, UseGuards, Request } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('telegram')
@UseGuards(JwtAuthGuard)
export class TelegramController {
  constructor(private telegramService: TelegramService) {}

  @Post('send-code')
  sendCode(@Request() req, @Body('phoneNumber') phoneNumber: string) {
    return this.telegramService.sendCode(req.user.userId, phoneNumber);
  }

  @Post('verify-code')
  verifyCode(
    @Request() req,
    @Body('phoneNumber') phoneNumber: string,
    @Body('code') code: string,
    @Body('password') password?: string,
  ) {
    return this.telegramService.verifyCode(req.user.userId, phoneNumber, code, password);
  }

  @Get('check-session')
  checkSession(@Request() req) {
    return this.telegramService.checkSession(req.user.userId);
  }
}

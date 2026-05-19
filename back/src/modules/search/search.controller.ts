import { Controller, Get, Query, UseGuards, Request } from '@nestjs/common';
import { SearchService } from './search.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('search')
@UseGuards(JwtAuthGuard)
export class SearchController {
  constructor(private searchService: SearchService) {}

  @Get()
  search(@Request() req, @Query('q') query: string) {
    return this.searchService.semanticSearch(req.user.userId, query);
  }

  @Get('categorized')
  getCategorized(@Request() req, @Query('page') page?: string, @Query('limit') limit?: string) {
    const parsedPage = page ? parseInt(page, 10) : 1;
    const parsedLimit = limit ? parseInt(limit, 10) : 20;
    return this.searchService.getCategorizedMessages(req.user.userId, parsedPage, parsedLimit);
  }

  @Get('ask')
  ask(@Request() req, @Query('q') question: string) {
    return this.searchService.askQuestion(req.user.userId, question);
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Message } from '../../database/schemas/message.schema';
import { AiService } from '../ai/ai.service';
import { QdrantService } from './qdrant.service';

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(
    @InjectModel(Message.name) private messageModel: Model<Message>,
    private aiService: AiService,
    private qdrantService: QdrantService,
  ) {}

  async semanticSearch(userId: string, query: string, limit = 5) {
    try {
      const queryEmbedding = await this.aiService.getEmbedding(query);
      if (queryEmbedding.length === 0) throw new Error('No embedding generated');

      // 1. Try Qdrant Search
      const qdrantResults = await this.qdrantService.search(userId, queryEmbedding, limit);
      
      if (qdrantResults && qdrantResults.length > 0) {
        // Map Qdrant results back to the expected format
        return qdrantResults
          .filter(res => res.payload)
          .map(res => ({
            _id: res.payload!.messageId,
            content: res.payload!.content,
            timestamp: res.payload!.timestamp,
            sender: res.payload!.sender,
            aiMetadata: res.payload!.aiMetadata,
            score: res.score,
          }));
      }
      
      return []; // Or fallback to text search if Qdrant is empty
    } catch (error) {
      this.logger.warn(`Vector search failed, falling back to text search: ${error.message}`);
      if (error.message.includes('requires additional configuration') || error.message.includes('connect to Atlas')) {
        this.logger.debug('Vector search not available (not on Atlas), using text search fallback.');
      } else {
        this.logger.warn(`Vector search failed, falling back to text search: ${error.message}`);
      }
      
      // 2. Fallback: Simple text search
      return this.messageModel.find({
        userId: new Types.ObjectId(userId),
        content: { $regex: query, $options: 'i' }
      } as any)
      .limit(limit)
      .sort({ timestamp: -1 })
      .select('content timestamp sender aiMetadata')
      .exec();
    }
  }

  async getCategorizedMessages(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    
    const items = await this.messageModel.find({
      userId: new Types.ObjectId(userId),
      'aiMetadata.category': { $exists: true, $ne: 'noise' }
    } as any)
    .sort({ timestamp: -1 })
    .skip(skip)
    .limit(limit)
    .select('content timestamp sender aiMetadata')
    .exec();

    const total = await this.messageModel.countDocuments({
      userId: new Types.ObjectId(userId),
      'aiMetadata.category': { $exists: true, $ne: 'noise' }
    } as any);

    return {
      items,
      total,
      page,
      limit,
      hasMore: skip + items.length < total
    };
  }

  async askQuestion(userId: string, question: string) {
    // 1. Retrieve relevant context
    const context = await this.semanticSearch(userId, question, 15); // Increased context size
    
    const contextText = context
      .map((m) => {
        const dateStr = new Date(m.timestamp).toLocaleString();
        return `[Date: ${dateStr}] [Sender: ${m.sender.name}] Content: ${m.content}`;
      })
      .join('\n---\n');

    // 2. Ask Gemini to answer based on context
    const prompt = `
      You are an AI Second Brain assistant. Use the following chat history context to answer the user's question.
      
      Instructions:
      - Provide a detailed and helpful answer based ONLY on the provided context.
      - Mention dates and senders if relevant to the answer.
      - If the answer is not in the context, politely say you don't have that information in your memory.
      - Stay concise but informative.
      
      CONTEXT:
      ${contextText}
      
      QUESTION: "${question}"
      
      ANSWER:
    `;

    return this.aiService.generateCompletion(prompt);
  }
}

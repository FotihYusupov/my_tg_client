import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Groq from 'groq-sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';

/**
 * Categories defined for long-term memory intelligence.
 */
export type MemoryCategory =
  | 'task'
  | 'meeting'
  | 'event'
  | 'deadline'
  | 'decision'
  | 'goal'
  | 'relationship'
  | 'preference'
  | 'project'
  | 'knowledge'
  | 'finance'
  | 'health'
  | 'travel'
  | 'conversation'
  | 'noise';

/**
 * Result of the AI-driven memory intelligence pipeline.
 */
export interface MemoryAnalysis {
  shouldStore: boolean;
  importance: number;
  category: MemoryCategory;
  reason: string;
  summary?: string;
  entities?: string[];
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private groq: Groq;
  private genAI: GoogleGenerativeAI;
  private embeddingModel: any;
  private readonly groqModel = 'llama-3.1-8b-instant';

  // Threshold for determining if a message is worthy of vector storage
  private readonly IMPORTANCE_THRESHOLD = 0.45;

  constructor(private configService: ConfigService) {
    // Initialize Groq for intelligence layer
    const groqApiKey = this.configService.get<string>('GROQ_API_KEY');
    if (groqApiKey) {
      this.groq = new Groq({ apiKey: groqApiKey });
    }

    // Initialize Gemini for embeddings only
    const geminiApiKey = this.configService.get<string>('GEMINI_API_KEY');
    if (geminiApiKey) {
      this.genAI = new GoogleGenerativeAI(geminiApiKey);
      // Using the specific model requested by the user
      this.embeddingModel = this.genAI.getGenerativeModel({ model: 'gemini-embedding-2' });
    }
  }

  /**
   * Deterministic pre-filter to catch conversational noise without calling AI.
   */
  private shouldSkipMessage(content: string): boolean {
    if (!content || content.trim().length < 3) return true;

    const noisePatterns = [
      /^(ok|okay|hop|ha|hah|haha|lol|lmao|tnx|thanks|ty|vse|bo’ldi|yaxshi|tushunarli)$/i,
      /^[👋🤝👍👎👊✌️👌✨🔥💯❤️😂🙏]+$/u,
      /^(salom|assalomu alaykum|qalaysiz|hi|hello|hey|privet)$/i,
      /^(da|yo'q|yoq|ha|hm|okey|yep|nope)$/i,
    ];

    return noisePatterns.some(pattern => pattern.test(content.trim()));
  }

  /**
   * Memory intelligence pipeline using Groq (Llama 3.1)
   */
  async analyzeMemory(
    content: string,
    previousMessages?: string[],
  ): Promise<MemoryAnalysis> {
    if (!this.groq) {
      return this.getDefaultAnalysis(false, 'Groq client not initialized');
    }

    if (this.shouldSkipMessage(content)) {
      return this.getDefaultAnalysis(false, 'Deterministic noise filter matched');
    }

    const context = previousMessages?.length 
      ? `CONTEXT (previous messages for context only):\n${previousMessages.join('\n')}\n---`
      : '';

    const prompt = `
      You are the Intelligence Engine of a "Second Brain" memory system. 
      Your goal is to extract long-term value from the following message, considering the provided context.
      
      MESSAGE TO ANALYZE: "${content}"
      ${context}

      CRITICAL RULES:
      1. LANGUAGES: The user speaks Uzbek (Latin/Cyrillic), Russian, and English. Understand nuances in all three.
      2. CONTEXT: Use the provided context to understand if this message is a meaningful part of a thread.
      3. UTILITY: Only store information with future value:
         - Tasks/Deadlines (e.g., "buni ertaga qil", "finish this")
         - Decisions (e.g., "biz shunga kelishdik", "let's go with X")
         - Knowledge/Facts (e.g., "parol 1234", "meeting link is Y")
         - Relationships/Preferences (e.g., "men buni yoqtiraman", "my wife's birthday is June 1st")
      4. NOISE: Return shouldStore: false for:
         - Casual chat (salom, qalaysiz, yaxshi, ok, haha, etc.)
         - Status updates without context (man keldim, ketdim)
         - Vague reactions (zo'r, baraka toping)
      5. IMPORTANCE: 0.0 (noise) to 1.0 (critical).

      Return ONLY a valid JSON object:
      {
        "shouldStore": boolean,
        "importance": float,
        "category": "task" | "meeting" | "event" | "deadline" | "decision" | "goal" | "relationship" | "preference" | "project" | "knowledge" | "finance" | "health" | "travel" | "conversation" | "noise",
        "reason": "short explanation in English",
        "summary": "concise one-line summary in English",
        "entities": ["keyword1", "keyword2"]
      }
    `;

    try {
      const completion = await this.withRetry(() => 
        this.groq.chat.completions.create({
          messages: [{ role: 'user', content: prompt }],
          model: this.groqModel,
          response_format: { type: 'json_object' },
          temperature: 0.1,
        })
      );

      const analysis: MemoryAnalysis = this.extractJson(completion.choices[0]?.message?.content || '{}');

      if (analysis.importance < this.IMPORTANCE_THRESHOLD) {
        analysis.shouldStore = false;
      }

      return analysis;
    } catch (error) {
      this.logger.error(`Groq memory analysis failed: ${error.message}`);
      return this.getDefaultAnalysis(false, 'Analysis error fallback');
    }
  }

  private extractJson(text: string): any {
    try {
      const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
      const jsonMatch = cleanText.match(/\[[\s\S]*\]|\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No valid JSON structure found');
      return JSON.parse(jsonMatch[0]);
    } catch (error) {
      this.logger.error(`JSON Parse Error: ${error.message}`);
      throw error;
    }
  }

  private async withRetry<T>(fn: () => Promise<T>, retries = 3, delay = 2000): Promise<T> {
    try {
      return await fn();
    } catch (error: any) {
      const isRateLimit = 
        error.status === 429 || 
        error.message?.includes('429') || 
        error.message?.includes('rate limit');

      if (retries > 0 && isRateLimit) {
        this.logger.warn(`API Rate Limit hit. Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.withRetry(fn, retries - 1, delay * 2);
      }
      throw error;
    }
  }

  private getDefaultAnalysis(shouldStore: boolean, reason: string): MemoryAnalysis {
    return {
      shouldStore,
      importance: 0.1,
      category: 'noise',
      reason,
      entities: []
    };
  }

  /**
   * Session-level intelligence analysis using Groq (Llama 3.1)
   */
  async analyzeSession(
    sessionPayload: any
  ): Promise<{ shouldStore: boolean; importanceScore: number; topics: string[]; summary: string; reason: string }> {
    if (!this.groq) {
      return {
        shouldStore: false,
        importanceScore: 0.1,
        topics: [],
        summary: 'Groq client not initialized',
        reason: 'Groq client not initialized'
      };
    }

    const prompt = `
      You are the Intelligence Engine of a "Second Brain" memory system. 
      Your goal is to extract long-term value from the following conversation session payload.
      
      SESSION PAYLOAD:
      ${JSON.stringify(sessionPayload, null, 2)}

      CRITICAL RULES:
      1. LANGUAGES: The participants speak Uzbek (Latin/Cyrillic), Russian, and English. Understand nuances in all three.
      2. SUMMARY: Provide a clear, structured, and informative summary of what was discussed/decided in the conversation.
      3. TOPICS: Extract a list of up to 5 concise key topics or keywords.
      4. UTILITY (shouldStore): Return shouldStore: true only if the conversation contains valuable details, tasks, decisions, goal discussions, project details, deadlines, important preferences, or long-term knowledge.
      5. IMPORTANCE: 0.0 (casual chitchat/noise) to 1.0 (critical milestones, decisions, or passwords/links).
      
      Return ONLY a valid JSON object:
      {
        "shouldStore": boolean,
        "importanceScore": float,
        "topics": ["topic1", "topic2"],
        "summary": "clear detailed summary in English",
        "reason": "short explanation of why this session is important or not"
      }
    `;

    try {
      const completion = await this.withRetry(() => 
        this.groq.chat.completions.create({
          messages: [{ role: 'user', content: prompt }],
          model: this.groqModel,
          response_format: { type: 'json_object' },
          temperature: 0.2,
        })
      );

      const analysis = this.extractJson(completion.choices[0]?.message?.content || '{}');
      
      return {
        shouldStore: !!analysis.shouldStore,
        importanceScore: typeof analysis.importanceScore === 'number' ? analysis.importanceScore : 0.1,
        topics: Array.isArray(analysis.topics) ? analysis.topics : [],
        summary: analysis.summary || 'Summary unavailable',
        reason: analysis.reason || 'No reason provided'
      };
    } catch (error) {
      this.logger.error(`Groq session analysis failed: ${error.message}`);
      return {
        shouldStore: false,
        importanceScore: 0.1,
        topics: [],
        summary: 'Error during session analysis.',
        reason: error.message
      };
    }
  }

  /**
   * Generates embeddings using Google Gemini (gemini-embedding-2)
   */
  async getEmbedding(text: string): Promise<number[]> {
    if (!this.embeddingModel) {
      this.logger.error('Gemini embedding model not initialized');
      return [];
    }

    try {
      const result = await this.withRetry(() => this.embeddingModel.embedContent(text)) as any;
      return result.embedding.values;
    } catch (error) {
      this.logger.error(`Gemini embedding error: ${error.message}`);
      return [];
    }
  }

  async getBatchEmbeddings(texts: string[]): Promise<number[][]> {
    if (!this.embeddingModel || texts.length === 0) return [];

    try {
      const result = await this.withRetry(() => this.embeddingModel.batchEmbedContents({
        requests: texts.map(t => ({ content: { role: 'user', parts: [{ text: t }] } }))
      })) as any;
      return result.embeddings.map((e: any) => e.values);
    } catch (error) {
      this.logger.error(`Gemini batch embedding error: ${error.message}`);
      return [];
    }
  }

  async generateCompletion(prompt: string): Promise<string> {
    if (!this.groq) return 'Groq unavailable';

    try {
      const completion = await this.withRetry(() =>
        this.groq.chat.completions.create({
          messages: [{ role: 'user', content: prompt }],
          model: this.groqModel,
          temperature: 0.7,
        })
      );
      return completion.choices[0]?.message?.content?.trim() || '';
    } catch (error) {
      this.logger.error(`Groq completion error: ${error.message}`);
      return 'Failed to generate AI completion.';
    }
  }

  async generateSummary(messages: string[]): Promise<string> {
    const prompt = `Summarize these messages concisely:\n${messages.join('\n')}`;
    return this.generateCompletion(prompt);
  }
}

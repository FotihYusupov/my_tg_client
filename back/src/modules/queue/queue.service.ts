import { Injectable, Logger, Inject, forwardRef, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { QueueJob } from '../../database/schemas/queue-job.schema';
import { ChatSession } from '../../database/schemas/chat-session.schema';
import { IngestionService } from '../ingestion/ingestion.service';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { Queue, Worker, Job } from 'bullmq';

@Injectable()
export class QueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('[QueueArchitecture]');
  private useBullMQ = false;
  private redisClient: Redis | null = null;
  private queues = new Map<string, Queue>();
  private workers = new Map<string, Worker>();
  private fallbackInterval: NodeJS.Timeout | null = null;

  private isProcessingAiFallback = 0;
  private isProcessingEmbeddingFallback = 0;

  constructor(
    @InjectModel(QueueJob.name) private queueJobModel: Model<QueueJob>,
    @InjectModel(ChatSession.name) private chatSessionModel: Model<ChatSession>,
    private configService: ConfigService,
    @Inject(forwardRef(() => IngestionService))
    private ingestionService: IngestionService,
  ) {}

  async onModuleInit() {
    await this.initializeQueueSystem();
  }

  async onModuleDestroy() {
    this.logger.log('Shutting down queue system...');
    if (this.fallbackInterval) {
      clearInterval(this.fallbackInterval);
    }
    
    // Close BullMQ workers
    for (const [name, worker] of this.workers.entries()) {
      try {
        await worker.close();
        this.logger.log(`Worker for queue "${name}" closed.`);
      } catch (err) {
        this.logger.error(`Error closing worker for queue "${name}": ${err.message}`);
      }
    }

    // Close BullMQ queues
    for (const [name, queue] of this.queues.entries()) {
      try {
        await queue.close();
        this.logger.log(`Queue "${name}" closed.`);
      } catch (err) {
        this.logger.error(`Error closing queue "${name}": ${err.message}`);
      }
    }

    // Close Redis connection
    if (this.redisClient) {
      try {
        await this.redisClient.quit();
        this.logger.log('Redis client connection closed.');
      } catch (err) {
        // Suppress
      }
    }
  }

  private async initializeQueueSystem() {
    const redisHost = this.configService.get<string>('REDIS_HOST') || 'localhost';
    const redisPort = this.configService.get<number>('REDIS_PORT') || 6379;
    const redisPassword = this.configService.get<string>('REDIS_PASSWORD') || undefined;

    this.logger.log(`Detecting Redis connection at ${redisHost}:${redisPort}...`);

    try {
      // Connect to Redis with a short 2-second timeout to check availability
      const connectionCheck = new Redis({
        host: redisHost,
        port: redisPort,
        password: redisPassword,
        connectTimeout: 2000,
        maxRetriesPerRequest: 1,
      });

      await new Promise<void>((resolve, reject) => {
        connectionCheck.on('connect', () => {
          connectionCheck.disconnect();
          resolve();
        });
        connectionCheck.on('error', (err) => {
          reject(err);
        });
      });

      this.logger.log('Redis connection succeeded. Activating high-performance BullMQ queue provider.');
      this.useBullMQ = true;

      // Initialize persistent client for workers/queues
      this.redisClient = new Redis({
        host: redisHost,
        port: redisPort,
        password: redisPassword,
        maxRetriesPerRequest: null, // Critical for BullMQ
      });

      // 1. Initialize BullMQ Queues
      this.queues.set(
        'session-ai-analysis',
        new Queue('session-ai-analysis', { connection: this.redisClient })
      );
      this.queues.set(
        'embedding-generation',
        new Queue('embedding-generation', { connection: this.redisClient })
      );

      // 2. Initialize Isolated BullMQ Workers with concurrency tuning
      this.workers.set(
        'session-ai-analysis',
        new Worker(
          'session-ai-analysis',
          async (job: Job) => {
            this.logger.log(`[AIWorker] [BullMQ] Job ${job.id} started. Session ID: ${job.data.sessionId}`);
            await this.ingestionService.processSessionWithAiById(job.data.sessionId);
          },
          {
            connection: this.redisClient,
            concurrency: 3, // Concurrency 3 for AI analysis
            limiter: {
              max: 10,
              duration: 10000, // Throttling: max 10 jobs per 10s
            },
          }
        )
      );

      this.workers.set(
        'embedding-generation',
        new Worker(
          'embedding-generation',
          async (job: Job) => {
            this.logger.log(`[EmbeddingWorker] [BullMQ] Job ${job.id} started. Session ID: ${job.data.sessionId}`);
            await this.ingestionService.processSessionEmbeddingById(job.data.sessionId);
          },
          {
            connection: this.redisClient,
            concurrency: 2, // Concurrency 2 for embeddings
            limiter: {
              max: 20,
              duration: 10000, // Throttling: max 20 jobs per 10s
            },
          }
        )
      );

      // Listen for worker errors
      for (const [name, worker] of this.workers.entries()) {
        worker.on('failed', (job, err) => {
          this.logger.error(`[BullMQ] Worker "${name}" job ${job?.id} failed: ${err.message}`);
        });
      }

    } catch (err) {
      this.logger.warn(
        `Redis is unreachable at ${redisHost}:${redisPort}. ` +
        'Activating transaction-safe Mongoose-backed database queue failover.'
      );
      this.useBullMQ = false;

      // Start the Mongoose queue polling interval loop
      this.fallbackInterval = setInterval(async () => {
        await this.pollMongooseFallbackQueues();
      }, 15000); // Poll every 15 seconds
    }
  }

  // ==================================================
  // PUBLIC UNIFIED API
  // ==================================================
  async enqueue(queueName: 'session-ai-analysis' | 'embedding-generation', sessionId: string): Promise<void> {
    const sId = new Types.ObjectId(sessionId);

    // Update Session status to queued
    await this.chatSessionModel.updateOne(
      { _id: sId },
      { $set: { status: 'queued' } }
    ).exec();

    if (this.useBullMQ) {
      const queue = this.queues.get(queueName);
      if (queue) {
        await queue.add(
          `${queueName}-job-${sessionId}`,
          { sessionId },
          {
            attempts: 3,
            backoff: {
              type: 'exponential',
              delay: 15000, // Delay doubles on retry (15s, 30s, 60s)
            },
            removeOnComplete: true,
            removeOnFail: false, // Keep failures in BullMQ dashboard for recovery
          }
        );
        this.logger.log(`[QueueService] [BullMQ] Successfully enqueued job in "${queueName}" for session ${sessionId}.`);
        return;
      }
    }

    // Fallback: Mongoose QueueJob
    const exists = await this.queueJobModel.findOne({
      queueName,
      sessionId: sId,
      status: { $in: ['queued', 'processing'] }
    }).exec();

    if (!exists) {
      await this.queueJobModel.create({
        queueName,
        sessionId: sId,
        status: 'queued',
        attempts: 0,
        maxAttempts: 3,
        runAt: new Date()
      });
      this.logger.log(`[QueueService] [MongooseFallback] Successfully enqueued job in "${queueName}" for session ${sessionId}.`);
    }
  }

  // ==================================================
  // MONGOOSE FALLBACK WORKERS POOL
  // ==================================================
  private async pollMongooseFallbackQueues() {
    await this.pollAiAnalysisFallback();
    await this.pollEmbeddingFallback();
  }

  private async pollAiAnalysisFallback() {
    if (this.isProcessingAiFallback >= 3) return;

    const limit = 3 - this.isProcessingAiFallback;
    const jobs = await this.queueJobModel.find({
      queueName: 'session-ai-analysis',
      status: 'queued',
      runAt: { $lte: new Date() }
    }).limit(limit).exec();

    for (const job of jobs) {
      this.isProcessingAiFallback++;
      this.runMongooseAiJob(job).finally(() => {
        this.isProcessingAiFallback--;
      });
    }
  }

  private async pollEmbeddingFallback() {
    if (this.isProcessingEmbeddingFallback >= 2) return;

    const limit = 2 - this.isProcessingEmbeddingFallback;
    const jobs = await this.queueJobModel.find({
      queueName: 'embedding-generation',
      status: 'queued',
      runAt: { $lte: new Date() }
    }).limit(limit).exec();

    for (const job of jobs) {
      this.isProcessingEmbeddingFallback++;
      this.runMongooseEmbeddingJob(job).finally(() => {
        this.isProcessingEmbeddingFallback--;
      });
    }
  }

  private async runMongooseAiJob(job: any) {
    const sessionId = job.sessionId.toString();
    
    job.status = 'processing';
    await job.save();

    await this.chatSessionModel.updateOne(
      { _id: job.sessionId },
      { $set: { status: 'processing' } }
    ).exec();

    this.logger.log(`[AIWorker] [Fallback] Started processing job ${job._id} for session ${sessionId}. Attempt ${job.attempts + 1}`);
    const startTime = Date.now();

    try {
      await this.ingestionService.processSessionWithAiById(sessionId);

      job.status = 'completed';
      await job.save();

      const duration = Date.now() - startTime;
      this.logger.log(`[AIWorker] [Fallback] Successfully completed job ${job._id} for session ${sessionId} in ${duration}ms`);
      
    } catch (err) {
      const duration = Date.now() - startTime;
      job.attempts += 1;
      
      const isRateLimit = err.message.includes('429') || err.message.toLowerCase().includes('rate limit') || err.message.toLowerCase().includes('timeout');
      const backoffSec = isRateLimit ? Math.pow(2, job.attempts) * 30 : Math.pow(2, job.attempts) * 15;
      const runAt = new Date(Date.now() + backoffSec * 1000);

      this.logger.warn(
        `[AIWorker] [Fallback] Failed job ${job._id} for session ${sessionId} in ${duration}ms. ` +
        `Error: ${err.message}. Attempt ${job.attempts}/${job.maxAttempts}. ` +
        (job.attempts < job.maxAttempts ? `Retrying in ${backoffSec}s` : 'Moving to dead-letter state')
      );

      if (job.attempts < job.maxAttempts) {
        job.status = 'queued';
        job.runAt = runAt;
        job.error = err.message;
        await job.save();

        await this.chatSessionModel.updateOne(
          { _id: job.sessionId },
          { $set: { status: 'queued' } }
        ).exec();
      } else {
        job.status = 'failed';
        job.error = err.message;
        await job.save();

        await this.chatSessionModel.updateOne(
          { _id: job.sessionId },
          { $set: { status: 'failed' } }
        ).exec();
      }
    }
  }

  private async runMongooseEmbeddingJob(job: any) {
    const sessionId = job.sessionId.toString();
    
    job.status = 'processing';
    await job.save();

    await this.chatSessionModel.updateOne(
      { _id: job.sessionId },
      { $set: { status: 'processing' } }
    ).exec();

    this.logger.log(`[EmbeddingWorker] [Fallback] Started processing job ${job._id} for session ${sessionId}. Attempt ${job.attempts + 1}`);
    const startTime = Date.now();

    try {
      await this.ingestionService.processSessionEmbeddingById(sessionId);

      job.status = 'completed';
      await job.save();

      const duration = Date.now() - startTime;
      this.logger.log(`[EmbeddingWorker] [Fallback] Successfully completed job ${job._id} in ${duration}ms`);
      
    } catch (err) {
      const duration = Date.now() - startTime;
      job.attempts += 1;
      
      const isRateLimit = err.message.includes('429') || err.message.toLowerCase().includes('rate limit') || err.message.toLowerCase().includes('timeout');
      const backoffSec = isRateLimit ? Math.pow(2, job.attempts) * 30 : Math.pow(2, job.attempts) * 15;
      const runAt = new Date(Date.now() + backoffSec * 1000);

      this.logger.warn(
        `[EmbeddingWorker] [Fallback] Failed job ${job._id} for session ${sessionId} in ${duration}ms. ` +
        `Error: ${err.message}. Attempt ${job.attempts}/${job.maxAttempts}. ` +
        (job.attempts < job.maxAttempts ? `Retrying in ${backoffSec}s` : 'Moving to dead-letter state')
      );

      if (job.attempts < job.maxAttempts) {
        job.status = 'queued';
        job.runAt = runAt;
        job.error = err.message;
        await job.save();

        await this.chatSessionModel.updateOne(
          { _id: job.sessionId },
          { $set: { status: 'queued' } }
        ).exec();
      } else {
        job.status = 'failed';
        job.error = err.message;
        await job.save();

        await this.chatSessionModel.updateOne(
          { _id: job.sessionId },
          { $set: { status: 'failed' } }
        ).exec();
      }
    }
  }

  isUsingBullMQ(): boolean {
    return this.useBullMQ;
  }
}

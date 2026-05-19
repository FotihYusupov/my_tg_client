import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { QdrantClient } from '@qdrant/js-client-rest';

@Injectable()
export class QdrantService implements OnModuleInit {
  private readonly logger = new Logger(QdrantService.name);
  private client: QdrantClient;
  private readonly collectionName = 'messages';

  constructor(private configService: ConfigService) {
    this.client = new QdrantClient({
      url: this.configService.get<string>('QDRANT_URL'),
      apiKey: this.configService.get<string>('QDRANT_API_KEY'),
    });
  }

  async onModuleInit() {
    try {
      const collections = await this.client.getCollections();
      const collection = collections.collections.find(c => c.name === this.collectionName);

      const targetSize = 3072; // gemini-embedding-2 dimension is 3072

      if (collection) {
        // Check if dimension matches
        const info = await this.client.getCollection(this.collectionName);
        const currentSize = (info.config.params.vectors as any).size;
        
        if (currentSize !== targetSize) {
          this.logger.warn(`Dimension mismatch (${currentSize} vs ${targetSize}). Recreating collection...`);
          await this.client.deleteCollection(this.collectionName);
          await this.createCollection(targetSize);
        }
      } else {
        this.logger.log(`Creating collection: ${this.collectionName}`);
        await this.createCollection(targetSize);
      }
    } catch (error) {
      this.logger.error(`Failed to initialize Qdrant: ${error.message}`);
    }
  }

  private async createCollection(size: number) {
    await this.client.createCollection(this.collectionName, {
      vectors: {
        size,
        distance: 'Cosine',
      },
    });
  }

  private mongoIdToUuid(mongoId: string): string {
    // MongoDB ID is 24 hex chars. UUID is 32 hex chars.
    // We pad with 8 zeros and format as 8-4-4-4-12
    const padded = mongoId.padStart(32, '0');
    return `${padded.slice(0, 8)}-${padded.slice(8, 12)}-${padded.slice(12, 16)}-${padded.slice(16, 20)}-${padded.slice(20)}`;
  }

  async upsertMessage(messageId: string, userId: string, embedding: number[], metadata: any) {
    try {
      const uuid = this.mongoIdToUuid(messageId);
      await this.client.upsert(this.collectionName, {
        wait: true,
        points: [
          {
            id: uuid,
            vector: embedding,
            payload: {
              ...metadata,
              userId,
              messageId,
            },
          },
        ],
      });
    } catch (error) {
      this.logger.error(`Failed to upsert to Qdrant (len: ${embedding.length}): ${error.message}`);
    }
  }

  async search(userId: string, vector: number[], limit = 5) {
    try {
      const results = await this.client.search(this.collectionName, {
        vector: vector,
        /*
        filter: {
          must: [
            {
              key: 'userId',
              match: {
                value: userId,
              },
            },
          ],
        },
        */
        limit: limit,
        with_payload: true,
      });

      return results;
    } catch (error) {
      this.logger.error(`Qdrant search failed (len: ${vector.length}): ${error.message}`);
      return [];
    }
  }
}

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true })
export class QueueJob extends Document {
  @Prop({ required: true })
  queueName: string; // 'session-ai-analysis' | 'embedding-generation'

  @Prop({ type: Types.ObjectId, ref: 'ChatSession', required: true })
  sessionId: Types.ObjectId;

  @Prop({ required: true, enum: ['queued', 'processing', 'completed', 'failed'], default: 'queued' })
  status: string;

  @Prop({ default: 0 })
  attempts: number;

  @Prop({ default: 3 })
  maxAttempts: number;

  @Prop()
  error?: string;

  @Prop({ default: () => new Date() })
  runAt: Date;
}

export const QueueJobSchema = SchemaFactory.createForClass(QueueJob);
QueueJobSchema.index({ queueName: 1, status: 1, runAt: 1 });

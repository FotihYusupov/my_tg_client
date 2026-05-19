import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true })
export class ChatSession extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Chat', required: true })
  chatId: Types.ObjectId;

  @Prop({ required: true })
  startedAt: Date;

  @Prop({ required: true })
  endedAt: Date;

  @Prop({ required: true })
  lastMessageAt: Date;

  @Prop({ default: 0 })
  messageCount: number;

  @Prop({ type: [String], default: [] })
  participants: string[];

  @Prop({ required: true, enum: ['active', 'closed', 'queued', 'processing', 'completed', 'failed'], default: 'active' })
  status: string;

  @Prop({ default: false })
  aiProcessed: boolean;

  @Prop({ default: 0 })
  importanceScore: number;

  @Prop({ type: [String], default: [] })
  topics: string[];

  @Prop()
  summary?: string;

  @Prop({ type: Object, default: {} })
  metadata: {
    chatType: string;
    totalMessages: number;
    totalCharacters: number;
  };
}

export const ChatSessionSchema = SchemaFactory.createForClass(ChatSession);
ChatSessionSchema.index({ userId: 1, chatId: 1, status: 1 });
ChatSessionSchema.index({ status: 1, lastMessageAt: 1 });

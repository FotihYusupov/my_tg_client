import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true })
export class Message extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Chat', required: true })
  chatId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'ChatSession' })
  sessionId?: Types.ObjectId;

  @Prop({ required: true })
  externalId: number; // Telegram messageId

  @Prop({ required: true })
  content: string;

  @Prop({ required: true })
  timestamp: Date;

  @Prop({ type: Object })
  sender: {
    id: string;
    name: string;
    username?: string;
  };

  @Prop({ type: Object, default: {} })
  aiMetadata: {
    importance?: number;
    category?: string;
    summary?: string;
    embedding?: number[];
    isProcessed?: boolean;
  };
}

export const MessageSchema = SchemaFactory.createForClass(Message);
MessageSchema.index({ userId: 1, chatId: 1, externalId: 1 }, { unique: true });
MessageSchema.index({ userId: 1, timestamp: -1 });
MessageSchema.index({ sessionId: 1, timestamp: 1 });
// Vector index will be added at the database level (MongoDB Atlas)

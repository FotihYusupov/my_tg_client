import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

@Schema({ timestamps: true })
export class Chat extends Document {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  userId: MongooseSchema.Types.ObjectId;

  @Prop({ required: true })
  externalId: string; // Telegram chatId

  @Prop({ required: true })
  title: string;

  @Prop({ required: true, enum: ['private', 'group', 'channel'] })
  type: string;

  @Prop({ default: 0 })
  lastSyncId: number; // Highest message ID processed

  @Prop({ default: 0 })
  firstSyncId: number; // Lowest message ID processed (for history)

  @Prop({ default: false })
  isIgnored: boolean;

  @Prop({ default: false })
  isMonitored: boolean;

  @Prop({ default: 'none' })
  category: string;

  @Prop({ type: Object })
  metadata: any;
}

export const ChatSchema = SchemaFactory.createForClass(Chat);
ChatSchema.index({ userId: 1, externalId: 1 }, { unique: true });
ChatSchema.index({ userId: 1, isMonitored: 1 });

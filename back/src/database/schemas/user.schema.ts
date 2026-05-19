import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class User extends Document {
  @Prop({ unique: true, required: true })
  email: string;

  @Prop({ required: true, select: false })
  password: string;

  @Prop()
  telegramId?: string;

  @Prop()
  phoneNumber?: string;

  @Prop()
  tgSession?: string; // Encrypted session string

  @Prop({ type: Object, default: { syncEnabled: true, digestFrequency: 'daily' } })
  settings: {
    syncEnabled: boolean;
    digestFrequency: string;
  };
}

export const UserSchema = SchemaFactory.createForClass(User);

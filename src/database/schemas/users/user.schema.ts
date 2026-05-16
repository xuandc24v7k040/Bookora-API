import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type UserDocument = HydratedDocument<User>;

@Schema({
  collection: 'users',
  timestamps: true,
})
export class User {
  @Prop({ required: true, trim: true })
  fullName!: string;

  @Prop({ required: true, lowercase: true, trim: true, unique: true })
  email!: string;

  @Prop({ select: false })
  passwordHash?: string;

  @Prop({ trim: true })
  phone?: string;

  @Prop({ enum: ['user', 'admin'], default: 'user' })
  role!: 'user' | 'admin';

  @Prop({ type: String, select: false, default: null })
  refreshTokenHash?: string | null;

  @Prop({ default: 0 })
  failedLoginAttempts!: number;

  @Prop({ type: Date, default: null })
  lockUntil?: Date | null;

  @Prop({ enum: ['local', 'google'], default: 'local' })
  provider!: 'local' | 'google';

  @Prop()
  googleId?: string;

  @Prop({ default: true })
  isActive!: boolean;
}

export const UserSchema = SchemaFactory.createForClass(User);

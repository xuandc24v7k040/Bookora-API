import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type UserDocument = HydratedDocument<User>;

@Schema({
  collection: 'users',
  timestamps: true,
})
export class User {
  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ required: true, lowercase: true, trim: true, unique: true })
  email!: string;

  @Prop({ trim: true })
  phone?: string;

  @Prop({ default: true })
  isActive!: boolean;
}

export const UserSchema = SchemaFactory.createForClass(User);

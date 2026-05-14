import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AbstractRepository } from '../../core/repositories/abstract.repository';
import { User, UserDocument } from '../../database/schemas/users/user.schema';

@Injectable()
export class UsersRepository extends AbstractRepository<UserDocument> {
  constructor(@InjectModel(User.name) userModel: Model<UserDocument>) {
    super(userModel);
  }
}

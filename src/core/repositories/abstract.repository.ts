import {
  type Model,
  type Document,
  type SaveOptions,
  type UpdateQuery,
} from 'mongoose';
import {
  type RepositoryFilter,
  type RepositoryOptions,
  type RepositoryProjection,
} from '../../common/types';

export abstract class AbstractRepository<T extends Document> {
  constructor(protected readonly model: Model<T>) {}

  async create(doc: Partial<T>, options?: SaveOptions): Promise<T> {
    const createdEntity = new this.model(doc);
    return await createdEntity.save(options);
  }

  async findById(
    id: string,
    projection?: RepositoryProjection<T>,
  ): Promise<T | null> {
    return this.model.findById(id, projection).exec();
  }

  async findOne(
    filterQuery: RepositoryFilter<T>,
    projection?: RepositoryProjection<T>,
  ): Promise<T | null> {
    return this.model.findOne(filterQuery, projection).exec();
  }

  async find(
    filterQuery: RepositoryFilter<T>,
    projection?: RepositoryProjection<T>,
    options?: RepositoryOptions<T>,
  ): Promise<T[]> {
    return this.model.find(filterQuery, projection, options).exec();
  }

  async count(filterQuery: RepositoryFilter<T>): Promise<number> {
    return this.model.countDocuments(filterQuery).exec();
  }

  async findOneAndUpdate(
    filterQuery: RepositoryFilter<T>,
    update: UpdateQuery<T>,
    options?: RepositoryOptions<T>,
  ): Promise<T | null> {
    return this.model
      .findOneAndUpdate(filterQuery, update, { new: true, ...options })
      .exec();
  }

  async findOneAndDelete(
    filterQuery: RepositoryFilter<T>,
    options?: RepositoryOptions<T>,
  ): Promise<T | null> {
    return this.model.findOneAndDelete(filterQuery, options).exec();
  }

  async deleteMany(filterQuery: RepositoryFilter<T>): Promise<boolean> {
    const deleteResult = await this.model.deleteMany(filterQuery);
    return deleteResult.deletedCount >= 1;
  }
}

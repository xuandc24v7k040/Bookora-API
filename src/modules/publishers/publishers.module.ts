import { Module } from '@nestjs/common';
import { PublishersController } from './publishers.controller';
import { PublishersRepository } from './publishers.repository';
import { PublishersService } from './publishers.service';
@Module({
  controllers: [PublishersController],
  providers: [PublishersService, PublishersRepository],
})
export class PublishersModule {}

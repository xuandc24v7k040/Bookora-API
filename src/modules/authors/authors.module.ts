import { Module } from '@nestjs/common';
import { AuthorsController } from './authors.controller';
import { AuthorsRepository } from './authors.repository';
import { AuthorsService } from './authors.service';
@Module({
  controllers: [AuthorsController],
  providers: [AuthorsService, AuthorsRepository],
})
export class AuthorsModule {}

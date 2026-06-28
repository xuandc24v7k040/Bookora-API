import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersRepository } from './users.repository';
import { UsersService } from './users.service';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard';
import { CsrfGuard } from '../auth/guards/csrf.guard';
import { AuthorizationModule } from '../authorization';

@Module({
  imports: [AuthorizationModule],
  controllers: [UsersController],
  providers: [UsersRepository, UsersService, JwtAccessGuard, CsrfGuard],
  exports: [UsersRepository, UsersService],
})
export class UsersModule {}

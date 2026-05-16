import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';
import {
  AuthAttempt,
  AuthAttemptSchema,
} from '../../database/schemas/auth-attempts/auth-attempt.schema';
import { UsersModule } from '../users/users.module';
import { AuthAttemptsRepository } from './auth-attempts.repository';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { CsrfGuard } from './guards/csrf.guard';
import { AuthThrottlerGuard } from './guards/auth-throttler.guard';
import { GoogleOauthGuard } from './guards/google-oauth.guard';
import { JwtAccessGuard } from './guards/jwt-access.guard';
import { GoogleStrategy } from './strategies/google.strategy';
import { JwtAccessStrategy } from './strategies/jwt-access.strategy';

@Module({
  imports: [
    PassportModule,
    JwtModule.register({}),
    MongooseModule.forFeature([
      { name: AuthAttempt.name, schema: AuthAttemptSchema },
    ]),
    UsersModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthAttemptsRepository,
    AuthThrottlerGuard,
    CsrfGuard,
    JwtAccessGuard,
    GoogleOauthGuard,
    JwtAccessStrategy,
    GoogleStrategy,
  ],
})
export class AuthModule {}

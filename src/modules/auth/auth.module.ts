import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { UsersModule } from '../users/users.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { AuthAttemptsRepository } from './auth-attempts.repository';
import { AuthAttemptService } from './auth-attempt.service';
import { AuthSessionsRepository } from './auth-sessions.repository';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { TurnstileService } from './turnstile.service';
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
    UsersModule,
    AuthorizationModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    TurnstileService,
    AuthAttemptService,
    AuthAttemptsRepository,
    AuthSessionsRepository,
    AuthThrottlerGuard,
    CsrfGuard,
    JwtAccessGuard,
    GoogleOauthGuard,
    JwtAccessStrategy,
    GoogleStrategy,
  ],
})
export class AuthModule {}

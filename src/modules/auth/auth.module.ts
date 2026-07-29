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
import { MailModule } from '../mail/mail.module';
import { PasswordRecoveryController } from './password-recovery/password-recovery.controller';
import { PasswordRecoveryService } from './password-recovery/password-recovery.service';
import { PasswordRecoveryAttemptService } from './password-recovery/password-recovery-attempt.service';
import { PasswordResetTokensRepository } from './password-recovery/password-reset-tokens.repository';

@Module({
  imports: [
    PassportModule,
    JwtModule.register({}),
    UsersModule,
    AuthorizationModule,
    MailModule,
  ],
  controllers: [AuthController, PasswordRecoveryController],
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
    PasswordRecoveryService,
    PasswordRecoveryAttemptService,
    PasswordResetTokensRepository,
  ],
  exports: [AuthService],
})
export class AuthModule {}

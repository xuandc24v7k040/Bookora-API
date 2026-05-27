import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { CurrentUser } from './decorators/current-user.decorator';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { AuthService } from './auth.service';
import { CsrfGuard } from './guards/csrf.guard';
import { AuthThrottlerGuard } from './guards/auth-throttler.guard';
import { GoogleOauthGuard } from './guards/google-oauth.guard';
import { JwtAccessGuard } from './guards/jwt-access.guard';
import { TurnstileService } from './turnstile.service';
import type { AuthenticatedUser } from './types/authenticated-user.type';
import type { GoogleProfile } from './strategies/google.strategy';
import { ResponseMessage } from '../../common/decorators';
import authConfig from '../../config/auth.config';

const authThrottleConfig = authConfig().throttle;

@ApiTags('auth')
@Controller('auth')
@UseGuards(AuthThrottlerGuard)
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly turnstileService: TurnstileService,
    private readonly configService: ConfigService,
  ) {}

  @Post('register')
  @UseGuards(CsrfGuard)
  @Throttle({
    default: {
      limit: authThrottleConfig.register.limit,
      ttl: authThrottleConfig.register.ttlSeconds * 1000,
    },
  })
  @ApiOperation({
    summary: 'Đăng ký tài khoản',
    description: 'Tạo tài khoản mới, chưa đăng nhập tự động.',
  })
  @ApiResponse({ status: 201, description: 'Registered successfully' })
  @ResponseMessage('Đăng ký thành công')
  async register(@Body() dto: RegisterDto, @Req() req: Request) {
    await this.turnstileService.verifyToken(
      dto.turnstileToken,
      this.getClientIp(req),
    );
    return this.authService.register(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  @Throttle({
    default: {
      limit: authThrottleConfig.login.limit,
      ttl: authThrottleConfig.login.ttlSeconds * 1000,
    },
  })
  @ApiOperation({
    summary: 'Đăng nhập',
    description: 'Tạo phiên đăng nhập và lưu token vào cookie.',
  })
  @ApiResponse({ status: 200, description: 'Logged in successfully' })
  @ResponseMessage('Đăng nhập thành công')
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.turnstileService.verifyToken(
      dto.turnstileToken,
      this.getClientIp(req),
    );
    return this.authService.login(dto, this.getRequestMetadata(req), res);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  @ApiOperation({
    summary: 'Đăng xuất',
    description: 'Thu hồi phiên hiện tại và xóa cookie đăng nhập.',
  })
  @ResponseMessage('Đăng xuất thành công')
  logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.authService.logout(
      req.cookies?.accessToken as string | undefined,
      req.cookies?.refreshToken as string | undefined,
      res,
    );
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  @Throttle({
    default: {
      limit: authThrottleConfig.refresh.limit,
      ttl: authThrottleConfig.refresh.ttlSeconds * 1000,
    },
  })
  @ApiOperation({
    summary: 'Làm mới phiên đăng nhập',
    description: 'Cấp lại token mới từ refresh token trong cookie.',
  })
  @ResponseMessage('Làm mới phiên đăng nhập thành công')
  refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.authService.refresh(req.cookies?.refreshToken as string, res);
  }

  @Get('me')
  @UseGuards(JwtAccessGuard)
  @ApiOperation({
    summary: 'Lấy thông tin tài khoản hiện tại',
  })
  @ResponseMessage('Lấy thông tin người dùng thành công')
  me(@CurrentUser() user: AuthenticatedUser) {
    return user;
  }

  @Get('csrf-token')
  @Throttle({
    default: {
      limit: authThrottleConfig.csrf.limit,
      ttl: authThrottleConfig.csrf.ttlSeconds * 1000,
    },
  })
  @ApiOperation({
    summary: 'Tạo CSRF token',
  })
  @ResponseMessage('Tạo CSRF token thành công')
  csrfToken(@Res({ passthrough: true }) res: Response) {
    return this.authService.createCsrfToken(res);
  }

  @Get('google')
  @UseGuards(GoogleOauthGuard)
  @ApiOperation({ summary: 'Đăng nhập bằng Google' })
  google() {}

  @Get('google/callback')
  @UseGuards(GoogleOauthGuard)
  @ApiOperation({ summary: 'Xử lý callback Google' })
  async googleCallback(
    @Req() req: Request,
    @Query('state') state: string,
    @Res() res: Response,
  ) {
    const frontendUrl = this.configService.get<string>('app.frontendUrl');
    const validState = this.authService.validateOauthState(
      req.signedCookies?.oauthState as string | undefined,
      state,
    );

    if (!validState) {
      return res.redirect(`${frontendUrl}/login?error=google_auth_failed`);
    }

    try {
      await this.authService.loginWithGoogle(
        req.user as GoogleProfile,
        this.getRequestMetadata(req),
        res,
      );
      res.clearCookie('oauthState');
      return res.redirect(`${frontendUrl}/auth/callback?success=true`);
    } catch {
      return res.redirect(`${frontendUrl}/login?error=google_auth_failed`);
    }
  }

  private getRequestMetadata(req: Request) {
    return {
      ipAddress: this.getClientIp(req),
      userAgent: req.header('user-agent'),
    };
  }

  private getClientIp(req: Request) {
    const forwardedFor = req.header('x-forwarded-for');
    if (forwardedFor) {
      return forwardedFor.split(',')[0].trim();
    }

    return req.ip ?? req.socket.remoteAddress ?? 'unknown';
  }
}

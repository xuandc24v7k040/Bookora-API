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
import type { AuthenticatedUser } from './types/authenticated-user.type';
import type { GoogleProfile } from './strategies/google.strategy';
import { ResponseMessage } from '../../common/decorators';

@ApiTags('auth')
@Controller('auth')
@UseGuards(AuthThrottlerGuard)
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @Post('register')
  @UseGuards(CsrfGuard)
  @Throttle({
    default: {
      limit: Number(process.env.AUTH_REGISTER_LIMIT ?? 10),
      ttl: Number(process.env.AUTH_REGISTER_TTL_SECONDS ?? 60) * 1000,
    },
  })
  @ApiOperation({
    summary: 'Register with cookie-based JWT session',
    description: 'Sets accessToken and refreshToken as httpOnly cookies.',
  })
  @ApiResponse({ status: 201, description: 'Registered successfully' })
  @ResponseMessage('Đăng ký thành công')
  register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.authService.register(dto, res);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  @Throttle({
    default: {
      limit: Number(process.env.AUTH_LOGIN_LIMIT ?? 10),
      ttl: Number(process.env.AUTH_LOGIN_TTL_SECONDS ?? 60) * 1000,
    },
  })
  @ApiOperation({
    summary: 'Login with cookie-based JWT session',
    description: 'Sets accessToken and refreshToken as httpOnly cookies.',
  })
  @ApiResponse({ status: 200, description: 'Logged in successfully' })
  @ResponseMessage('Đăng nhập thành công')
  login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.authService.login(
      dto,
      req.ip ?? req.socket.remoteAddress ?? 'unknown',
      res,
    );
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  @ApiOperation({
    summary: 'Logout current session',
    description: 'Clears cookie-based JWT session.',
  })
  @ResponseMessage('Đăng xuất thành công')
  logout(
    @Req() req: Request,
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.authService.logout(
      user?.id,
      req.cookies?.refreshToken as string | undefined,
      res,
    );
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  @Throttle({
    default: {
      limit: Number(process.env.AUTH_REFRESH_LIMIT ?? 10),
      ttl: Number(process.env.AUTH_REFRESH_TTL_SECONDS ?? 60) * 1000,
    },
  })
  @ApiOperation({
    summary: 'Rotate refresh token and issue new cookies',
    description: 'Reads refreshToken from httpOnly cookie.',
  })
  @ResponseMessage('Làm mới phiên đăng nhập thành công')
  refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.authService.refresh(req.cookies?.refreshToken as string, res);
  }

  @Get('me')
  @UseGuards(JwtAccessGuard)
  @ApiOperation({
    summary: 'Get current authenticated user from accessToken cookie',
  })
  @ResponseMessage('Lấy thông tin người dùng thành công')
  me(@CurrentUser() user: AuthenticatedUser) {
    return user;
  }

  @Get('csrf-token')
  @Throttle({
    default: {
      limit: Number(process.env.AUTH_CSRF_LIMIT ?? 10),
      ttl: Number(process.env.AUTH_CSRF_TTL_SECONDS ?? 60) * 1000,
    },
  })
  @ApiOperation({
    summary: 'Issue initial CSRF cookie for cookie-authenticated flows',
  })
  @ResponseMessage('Tạo CSRF token thành công')
  csrfToken(@Res({ passthrough: true }) res: Response) {
    return this.authService.createCsrfToken(res);
  }

  @Get('google')
  @UseGuards(GoogleOauthGuard)
  @ApiOperation({ summary: 'Start Google OAuth login' })
  google() {}

  @Get('google/callback')
  @UseGuards(GoogleOauthGuard)
  @ApiOperation({ summary: 'Handle Google OAuth callback' })
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
      await this.authService.loginWithGoogle(req.user as GoogleProfile, res);
      res.clearCookie('oauthState');
      return res.redirect(`${frontendUrl}/auth/callback?success=true`);
    } catch {
      return res.redirect(`${frontendUrl}/login?error=google_auth_failed`);
    }
  }
}

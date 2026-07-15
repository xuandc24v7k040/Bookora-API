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
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { CurrentUser } from './decorators/current-user.decorator';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { AuthMeResponseDto } from './dto/auth-me-response.dto';
import {
  AuthMutationResponseDto,
  CsrfTokenResponseDto,
  PublicAuthUserResponseDto,
} from './dto/auth-response.dto';
import { AuthService } from './auth.service';
import { CsrfGuard } from './guards/csrf.guard';
import { AuthThrottlerGuard } from './guards/auth-throttler.guard';
import { GoogleOauthGuard } from './guards/google-oauth.guard';
import { JwtAccessGuard } from './guards/jwt-access.guard';
import { TurnstileService } from './turnstile.service';
import type { AuthenticatedUser } from './types/authenticated-user.type';
import type { GoogleProfile } from './strategies/google.strategy';
import {
  AUTH_ERROR_CODES,
  type GoogleOauthFailureCode,
} from './auth-error-codes';
import type { GoogleOauthRequest } from './guards/google-oauth.guard';
import { ApiBaseResponse, ResponseMessage } from '../../common/decorators';
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
  @ApiSecurity('csrf')
  @ApiBaseResponse(PublicAuthUserResponseDto, {
    status: 201,
    description: 'Đăng ký thành công',
  })
  @ResponseMessage('Đăng ký thành công')
  async register(@Body() dto: RegisterDto, @Req() req: Request) {
    await this.turnstileService.verifyToken(
      dto.turnstileToken,
      this.getClientIp(req),
      'register',
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
  @ApiSecurity('csrf')
  @ApiBaseResponse(PublicAuthUserResponseDto, {
    description: 'Đăng nhập thành công',
  })
  @ResponseMessage('Đăng nhập thành công')
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.turnstileService.verifyToken(
      dto.turnstileToken,
      this.getClientIp(req),
      'login',
    );
    return this.authService.login(dto, this.getRequestMetadata(req), res);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  @ApiOperation({
    summary: 'Đăng xuất',
    description:
      'Thu hồi tất cả phiên đang hoạt động của user xác định từ cookie accessToken hoặc refreshToken, sau đó xóa cookie đăng nhập.',
  })
  @ApiSecurity('accessToken')
  @ApiSecurity('refreshToken')
  @ApiSecurity('csrf')
  @ApiBaseResponse(AuthMutationResponseDto, {
    description: 'Đăng xuất thành công',
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
  @ApiSecurity('refreshToken')
  @ApiSecurity('csrf')
  @ApiBaseResponse(AuthMutationResponseDto, {
    description: 'Làm mới phiên đăng nhập thành công',
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
  @ApiSecurity('accessToken')
  @ApiBaseResponse(AuthMeResponseDto, {
    description: 'Lấy thông tin người dùng thành công',
  })
  @ResponseMessage('Lấy thông tin người dùng thành công')
  me(@CurrentUser() user: AuthenticatedUser) {
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      phone: user.phone,
      gender: user.gender,
      birthday: user.birthday,
      type: user.type,
      roles: user.roles,
      permissions: user.permissions,
      globalRoles: user.globalRoles,
      globalPermissions: user.globalPermissions,
      branchAssignments: user.branchAssignments,
      maxRoleLevel: user.maxRoleLevel,
      isSuperAdmin: user.isSuperAdmin,
      branches: user.branches,
      primaryBranchId: user.primaryBranchId,
    };
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
  @ApiBaseResponse(CsrfTokenResponseDto, {
    description: 'Tạo CSRF token thành công',
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
    @Req() req: GoogleOauthRequest,
    @Query('state') state: string,
    @Res() res: Response,
  ) {
    const frontendUrl = this.configService.get<string>('app.frontendUrl');
    if (req.googleOauthFailure) {
      this.clearOauthState(res);
      return this.redirectGoogleFailure(
        res,
        frontendUrl,
        req.googleOauthFailure,
      );
    }

    const validState = this.authService.validateOauthState(
      req.signedCookies?.oauthState as string | undefined,
      state,
    );

    if (!validState) {
      this.clearOauthState(res);
      return this.redirectGoogleFailure(
        res,
        frontendUrl,
        AUTH_ERROR_CODES.googleStateInvalid,
      );
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
      this.clearOauthState(res);
      return this.redirectGoogleFailure(
        res,
        frontendUrl,
        AUTH_ERROR_CODES.googleAuthFailed,
      );
    }
  }

  private redirectGoogleFailure(
    res: Response,
    frontendUrl: string | undefined,
    code: GoogleOauthFailureCode,
  ) {
    return res.redirect(`${frontendUrl}/login?error=${code}`);
  }

  private clearOauthState(res: Response) {
    res.clearCookie('oauthState');
  }

  private getRequestMetadata(req: Request) {
    return {
      ipAddress: this.getClientIp(req),
      userAgent: req.header('user-agent'),
    };
  }

  private getClientIp(req: Request) {
    const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown';
    return ip.startsWith('::ffff:') ? ip.slice(7) : ip;
  }
}

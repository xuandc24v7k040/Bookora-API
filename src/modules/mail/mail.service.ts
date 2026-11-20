import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { toPlainText } from '@react-email/render';
import { renderToStaticMarkup } from 'react-dom/server';
import { MAIL_PROVIDER, type MailProvider } from './mail-provider.interface';
import {
  bookoraActionEmail,
  passwordResetEmail,
} from './templates/password-reset-email';

interface SendPasswordResetInput {
  to: string;
  resetUrl: string;
  ttlMinutes: number;
}

@Injectable()
export class MailService {
  constructor(
    @Inject(MAIL_PROVIDER) private readonly provider: MailProvider,
    private readonly configService: ConfigService,
  ) {}

  async sendPasswordReset(input: SendPasswordResetInput): Promise<void> {
    const email = passwordResetEmail({
      resetUrl: input.resetUrl,
      ttlMinutes: input.ttlMinutes,
    });
    const html = `<!doctype html>${renderToStaticMarkup(email)}`;
    const text = toPlainText(html);

    await this.provider.send({
      from: this.configService.getOrThrow<string>('mail.from'),
      to: input.to,
      subject: 'Đặt lại mật khẩu Bookora',
      html,
      text,
    });
  }

  async sendEmailVerification(input: {
    to: string;
    verificationUrl: string;
    ttlMinutes: number;
  }): Promise<void> {
    const email = bookoraActionEmail({
      actionUrl: input.verificationUrl,
      ttlMinutes: input.ttlMinutes,
      title: 'Xác thực email',
      introduction:
        'Cảm ơn bạn đã đăng ký Bookora. Vui lòng xác thực email để đăng nhập tài khoản của bạn.',
      ignoreReason:
        'Nếu bạn không đăng ký tài khoản Bookora, hãy bỏ qua email này.',
    });
    const html = `<!doctype html>${renderToStaticMarkup(email)}`;
    await this.provider.send({
      from: this.configService.getOrThrow<string>('mail.from'),
      to: input.to,
      subject: 'Xác thực email Bookora',
      html,
      text: toPlainText(html),
    });
  }
}

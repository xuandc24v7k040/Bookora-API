import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { toPlainText } from '@react-email/render';
import { renderToStaticMarkup } from 'react-dom/server';
import { MAIL_PROVIDER, type MailProvider } from './mail-provider.interface';
import { passwordResetEmail } from './templates/password-reset-email';

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
}

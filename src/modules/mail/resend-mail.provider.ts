import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import {
  MailProviderError,
  type MailProvider,
  type SendMailInput,
} from './mail-provider.interface';

@Injectable()
export class ResendMailProvider implements MailProvider {
  private readonly resend: Resend;

  constructor(configService: ConfigService) {
    this.resend = new Resend(
      configService.getOrThrow<string>('mail.resendApiKey'),
    );
  }

  async send(input: SendMailInput): Promise<void> {
    try {
      const result = await this.resend.emails.send(input);
      if (result.error) {
        throw new MailProviderError();
      }
    } catch {
      throw new MailProviderError();
    }
  }
}

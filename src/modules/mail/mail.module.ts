import { Module } from '@nestjs/common';
import { MailService } from './mail.service';
import { MAIL_PROVIDER } from './mail-provider.interface';
import { ResendMailProvider } from './resend-mail.provider';

@Module({
  providers: [
    MailService,
    ResendMailProvider,
    {
      provide: MAIL_PROVIDER,
      useExisting: ResendMailProvider,
    },
  ],
  exports: [MailService],
})
export class MailModule {}

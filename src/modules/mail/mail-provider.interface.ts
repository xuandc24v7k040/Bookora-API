export interface SendMailInput {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface MailProvider {
  send(input: SendMailInput): Promise<void>;
}

export const MAIL_PROVIDER = Symbol('MAIL_PROVIDER');

export class MailProviderError extends Error {
  constructor() {
    super('Mail provider request failed');
    this.name = 'MailProviderError';
  }
}

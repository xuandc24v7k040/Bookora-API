import type { MailProvider } from './mail-provider.interface';
import { MailService } from './mail.service';

describe('MailService', () => {
  const provider: jest.Mocked<MailProvider> = {
    send: jest.fn(),
  };
  const configService = {
    getOrThrow: jest.fn((key: string) => {
      if (key === 'mail.from') return 'Bookora <no-reply@example.test>';
      throw new Error(`Unexpected config key: ${key}`);
    }),
  };
  const service = new MailService(provider, configService as never);

  beforeEach(() => {
    jest.clearAllMocks();
    provider.send.mockResolvedValue(undefined);
  });

  it('renders Vietnamese HTML and plain text through the provider', async () => {
    const resetUrl =
      'http://localhost:5173/reset-password?token=opaque-reset-token';

    await service.sendPasswordReset({
      to: 'customer@example.test',
      resetUrl,
      ttlMinutes: 2,
    });

    expect(provider.send.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        from: 'Bookora <no-reply@example.test>',
        to: 'customer@example.test',
        subject: 'Đặt lại mật khẩu Bookora',
        html: expect.stringContaining('Đặt lại mật khẩu'),
        text: expect.stringContaining(resetUrl),
      }),
    );
    const sent = provider.send.mock.calls[0]?.[0];
    expect(sent?.html).toContain('2 phút');
    expect(sent?.text).toContain('2 phút');
  });
});

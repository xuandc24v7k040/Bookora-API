import { parseGhnConfig } from './ghn.config';

describe('GHN configuration isolation', () => {
  const enabled = {
    GHN_ENABLED: 'true',
    GHN_BASE_URL: 'https://online-gateway.ghn.vn',
    GHN_TOKEN: 'unit-test-token',
    GHN_SHOP_ID: '123',
    GHN_TIMEOUT_MS: '5000',
  };
  it('parses false strictly and ignores disabled credentials', () => {
    expect(
      parseGhnConfig({
        GHN_ENABLED: 'false',
        GHN_BASE_URL: 'http://untrusted.test',
      }),
    ).toEqual({ enabled: false });
  });
  it('accepts both official HTTPS environments', () => {
    for (const host of ['online-gateway.ghn.vn', 'dev-online-gateway.ghn.vn'])
      expect(
        parseGhnConfig({ ...enabled, GHN_BASE_URL: `https://${host}` }),
      ).toMatchObject({ enabled: true, valid: true });
  });
  it.each([
    { GHN_BASE_URL: 'https://online-gateway.ghn.vn.attacker.test' },
    { GHN_BASE_URL: 'http://online-gateway.ghn.vn' },
    { GHN_BASE_URL: 'https://online-gateway.ghn.vn/redirect' },
    { GHN_BASE_URL: 'https://user:pass@online-gateway.ghn.vn' },
    { GHN_TOKEN: '' },
    { GHN_SHOP_ID: '0' },
    { GHN_SHOP_ID: '1.5' },
    { GHN_TIMEOUT_MS: '0' },
    { GHN_TIMEOUT_MS: '15001' },
  ])(
    'fails closed only for GHN with invalid integration settings %p',
    (overrides) => {
      expect(parseGhnConfig({ ...enabled, ...overrides })).toEqual({
        enabled: true,
        valid: false,
      });
    },
  );
});

import { UnprocessableEntityException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import { CheckoutLocationProofService } from './checkout-location-proof.service';

const SECRET = 'checkout-location-proof-unit-test-secret-32-chars';
const config = new ConfigService({
  shipping: { locationProof: { secret: SECRET, ttlSeconds: 600 } },
});

const input = {
  provinceCode: 92,
  provinceName: 'can tho',
  wardName: 'phuong ninh kieu',
  latitude: 10.0452,
  longitude: 105.7469,
};

function signedToken(overrides: Record<string, unknown>): string {
  const issuedAt = Math.floor(Date.now() / 1_000);
  const payload = Buffer.from(
    JSON.stringify({
      version: 1,
      purpose: 'checkout-current-location',
      ...input,
      issuedAt,
      expiresAt: issuedAt + 600,
      ...overrides,
    }),
  ).toString('base64url');
  const signature = createHmac('sha256', SECRET)
    .update(`checkout-current-location.${payload}`)
    .digest('base64url');
  return `${payload}.${signature}`;
}

describe('CheckoutLocationProofService', () => {
  const service = new CheckoutLocationProofService(config);

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-02T00:00:00Z'));
  });

  afterEach(() => jest.useRealTimers());

  it('round-trips an opaque signed current-location proof', () => {
    expect(service.verify(service.issue(input))).toEqual(input);
  });

  it('rejects a one-character token mutation', () => {
    const token = service.issue(input);
    const mutated = `${token.slice(0, -1)}${token.endsWith('A') ? 'B' : 'A'}`;
    expect(() => service.verify(mutated)).toThrow(UnprocessableEntityException);
  });

  it('rejects an expired token', () => {
    const token = service.issue(input);
    jest.advanceTimersByTime(601_000);
    expect(() => service.verify(token)).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({
          code: 'CHECKOUT_LOCATION_PROOF_EXPIRED',
        }),
      }),
    );
  });

  it.each([
    ['purpose', { purpose: 'another-purpose' }],
    ['version', { version: 2 }],
  ])('rejects a proof with the wrong %s', (_caseName, overrides) => {
    expect(() => service.verify(signedToken(overrides))).toThrow(
      UnprocessableEntityException,
    );
  });
});

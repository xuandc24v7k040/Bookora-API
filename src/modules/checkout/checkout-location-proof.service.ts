import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';

const LOCATION_PROOF_VERSION = 1;
const LOCATION_PROOF_PURPOSE = 'checkout-current-location';

interface LocationProofPayload {
  version: number;
  purpose: string;
  provinceCode: number;
  provinceName: string;
  wardName: string;
  latitude: number;
  longitude: number;
  issuedAt: number;
  expiresAt: number;
}

export interface CheckoutLocationProofInput {
  provinceCode: number;
  provinceName: string;
  wardName: string;
  latitude: number;
  longitude: number;
}

@Injectable()
export class CheckoutLocationProofService {
  constructor(private readonly config: ConfigService) {}

  issue(input: CheckoutLocationProofInput): string {
    const issuedAt = Math.floor(Date.now() / 1_000);
    const ttlSeconds = this.config.getOrThrow<number>(
      'shipping.locationProof.ttlSeconds',
    );
    const payload: LocationProofPayload = {
      version: LOCATION_PROOF_VERSION,
      purpose: LOCATION_PROOF_PURPOSE,
      ...input,
      issuedAt,
      expiresAt: issuedAt + ttlSeconds,
    };
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
      'base64url',
    );
    return `${encodedPayload}.${this.sign(encodedPayload)}`;
  }

  verify(token: string): CheckoutLocationProofInput {
    const parts = token.split('.');
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      this.invalid();
    }
    const [encodedPayload, receivedSignature] = parts as [string, string];
    const expectedSignature = this.sign(encodedPayload);
    const received = Buffer.from(receivedSignature, 'base64url');
    const expected = Buffer.from(expectedSignature, 'base64url');
    if (
      received.length !== expected.length ||
      !timingSafeEqual(received, expected)
    ) {
      this.invalid();
    }

    let payload: LocationProofPayload;
    try {
      payload = JSON.parse(
        Buffer.from(encodedPayload, 'base64url').toString('utf8'),
      ) as LocationProofPayload;
    } catch {
      this.invalid();
    }

    if (
      payload.version !== LOCATION_PROOF_VERSION ||
      payload.purpose !== LOCATION_PROOF_PURPOSE ||
      !Number.isInteger(payload.provinceCode) ||
      typeof payload.provinceName !== 'string' ||
      typeof payload.wardName !== 'string' ||
      !Number.isFinite(payload.latitude) ||
      !Number.isFinite(payload.longitude) ||
      !Number.isInteger(payload.issuedAt) ||
      !Number.isInteger(payload.expiresAt) ||
      payload.expiresAt <= payload.issuedAt
    ) {
      this.invalid();
    }
    if (payload.expiresAt < Math.floor(Date.now() / 1_000)) {
      throw new UnprocessableEntityException({
        code: 'CHECKOUT_LOCATION_PROOF_EXPIRED',
        message:
          'Xác nhận vị trí đã hết hạn. Vui lòng lấy lại vị trí hiện tại.',
      });
    }
    return {
      provinceCode: payload.provinceCode,
      provinceName: payload.provinceName,
      wardName: payload.wardName,
      latitude: payload.latitude,
      longitude: payload.longitude,
    };
  }

  private sign(encodedPayload: string): string {
    return createHmac(
      'sha256',
      this.config.getOrThrow<string>('shipping.locationProof.secret'),
    )
      .update(`${LOCATION_PROOF_PURPOSE}.${encodedPayload}`)
      .digest('base64url');
  }

  private invalid(): never {
    throw new UnprocessableEntityException({
      code: 'CHECKOUT_LOCATION_PROOF_INVALID',
      message:
        'Xác nhận vị trí không hợp lệ. Vui lòng lấy lại vị trí hiện tại.',
    });
  }
}

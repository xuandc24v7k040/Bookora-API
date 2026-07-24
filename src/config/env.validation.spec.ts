import { REQUIRED_ENV_KEYS } from './env.keys';
import { validateEnv } from './env.validation';

function validConfig(): Record<string, unknown> {
  const config = Object.fromEntries(
    REQUIRED_ENV_KEYS.map((key) => [key, 'test-value']),
  );
  return {
    ...config,
    NODE_ENV: 'development',
    API_PREFIX: 'api',
    STORAGE_PROVIDER: 'r2',
    R2_PUBLIC_BASE_URL: 'https://assets.example.test',
    GHN_BASE_URL: 'https://dev-online-gateway.ghn.vn',
    GHN_SHOP_ID: '1',
    GHN_TIMEOUT_MS: '1000',
    GHN_DEFAULT_ITEM_WEIGHT_GRAMS: '100',
    GHN_DEFAULT_PACKAGE_LENGTH_CM: '10',
    GHN_DEFAULT_PACKAGE_WIDTH_CM: '10',
    GHN_DEFAULT_PACKAGE_HEIGHT_CM: '10',
    VNPAY_ENV: 'sandbox',
    VNPAY_PAYMENT_URL: 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html',
    VNPAY_QUERY_URL:
      'https://sandbox.vnpayment.vn/merchant_webapi/api/transaction',
    VNPAY_RETURN_URL: 'http://localhost:8000/api/v1/payments/vnpay/return',
    VNPAY_FRONTEND_RESULT_URL: 'http://localhost:5173/checkout/payment-result',
    VNPAY_IPN_URL: 'http://localhost:8000/api/v1/payments/vnpay/ipn',
    VNPAY_PAYMENT_EXPIRE_MINUTES: '15',
  };
}

describe('VNPAY environment validation', () => {
  it('accepts local callback and frontend result routes that match runtime', () => {
    expect(validateEnv(validConfig())).toBeDefined();
  });

  it.each([
    ['VNPAY_RETURN_URL', 'http://localhost:8000/payments/vnpay/return'],
    ['VNPAY_FRONTEND_RESULT_URL', 'http://localhost:5173/payment/vnpay/return'],
  ])('rejects a mismatched local %s', (key, value) => {
    expect(() => validateEnv({ ...validConfig(), [key]: value })).toThrow(key);
  });

  it('rejects surrounding quotes or whitespace', () => {
    expect(() =>
      validateEnv({
        ...validConfig(),
        VNPAY_RETURN_URL:
          ' "http://localhost:8000/api/v1/payments/vnpay/return" ',
      }),
    ).toThrow('must not contain quotes or surrounding whitespace');
  });
});

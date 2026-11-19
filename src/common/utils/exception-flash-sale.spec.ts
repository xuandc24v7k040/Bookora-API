import { ConflictException } from '@nestjs/common';
import { normalizeException } from './exception.util';
describe('Flash Sale choice error contract', () => {
  const details = {
    cartItemId: 'cart-item',
    allowedQuantity: 2,
    requestedQuantity: 3,
    catalogPrice: 80000,
  };
  it('preserves only safe purchase choice fields', () => {
    const result = normalizeException(
      new ConflictException({
        code: 'FLASH_SALE_USER_LIMIT',
        message: 'Giới hạn',
        details: { ...details, privateAllocation: 'secret' },
      }),
    );
    expect(result.details).toEqual(details);
  });
  it('does not expose arbitrary details on unrelated errors or malformed choices', () => {
    expect(
      normalizeException(
        new ConflictException({ code: 'OTHER', message: 'Lỗi', details }),
      ).details,
    ).toBeUndefined();
    expect(
      normalizeException(
        new ConflictException({
          code: 'FLASH_SALE_USER_LIMIT',
          message: 'Lỗi',
          details: { ...details, allowedQuantity: -1 },
        }),
      ).details,
    ).toBeUndefined();
  });
});

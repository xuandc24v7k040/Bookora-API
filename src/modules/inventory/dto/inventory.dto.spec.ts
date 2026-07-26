import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  AdjustInventoryQuantityDto,
  InventoryAdjustmentDirection,
} from './inventory.dto';

describe('AdjustInventoryQuantityDto', () => {
  const payload = {
    expectedCurrentQuantity: 40,
    direction: InventoryAdjustmentDirection.INCREASE,
    note: 'Điều chỉnh sau kiểm kê',
  };

  it('accepts an integer quantity from 1 to 1000', async () => {
    await expect(
      validate(
        plainToInstance(AdjustInventoryQuantityDto, {
          ...payload,
          quantity: 1000,
        }),
      ),
    ).resolves.toHaveLength(0);
  });

  it.each([0, 1.5, 1001])(
    'rejects invalid adjustment quantity %s',
    async (quantity) => {
      await expect(
        validate(
          plainToInstance(AdjustInventoryQuantityDto, { ...payload, quantity }),
        ),
      ).resolves.not.toHaveLength(0);
    },
  );
});

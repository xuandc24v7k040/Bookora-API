import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { OrderStatus } from '@/generated/prisma/client';
import {
  CustomerOrderListQueryDto,
  CustomerOrderListTab,
} from './customer-order.dto';

describe('CustomerOrderListQueryDto', () => {
  it('normalizes repeated and comma-separated status values', async () => {
    const dto = plainToInstance(CustomerOrderListQueryDto, {
      status: ['PENDING_PAYMENT,PAYMENT_FAILED', 'PENDING'],
      page: '2',
      limit: '5',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto).toEqual(
      expect.objectContaining({
        status: [
          OrderStatus.PENDING_PAYMENT,
          OrderStatus.PAYMENT_FAILED,
          OrderStatus.PENDING,
        ],
        page: 2,
        limit: 5,
      }),
    );
  });

  it('accepts the semantic shipping and received tabs', async () => {
    for (const tab of Object.values(CustomerOrderListTab)) {
      const dto = plainToInstance(CustomerOrderListQueryDto, { tab });

      await expect(validate(dto)).resolves.toHaveLength(0);
      expect(dto.tab).toBe(tab);
    }
  });

  it.each([
    [{ status: 'NOT_A_STATUS' }, 'status'],
    [{ tab: 'completed' }, 'tab'],
    [{ page: '0' }, 'page'],
    [{ limit: '6' }, 'limit'],
  ])('rejects invalid list query %o', async (input, property) => {
    const errors = await validate(
      plainToInstance(CustomerOrderListQueryDto, input),
    );

    expect(errors.some((error) => error.property === property)).toBe(true);
  });
});

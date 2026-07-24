import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { DeliveryAddressSource } from '@/generated/prisma/client';
import { PreviewCheckoutDto } from './checkout.dto';

describe('PreviewCheckoutDto address discriminator', () => {
  const pipe = new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  });

  function transform(body: Record<string, unknown>): Promise<unknown> {
    return pipe.transform(body, {
      type: 'body',
      metatype: PreviewCheckoutDto,
    });
  }

  it('accepts the canonical saved-address payload with source whitelisted', async () => {
    await expect(
      transform({
        selectedCartItemIds: ['01K7Y7MWNCW7BNBBNTWAB9DYSG'],
        address: {
          source: DeliveryAddressSource.SAVED_ADDRESS,
          customerAddressId: '01K7Y7MWNCW7BNBBNTWAB9DYSH',
        },
      }),
    ).resolves.toMatchObject({
      address: {
        source: DeliveryAddressSource.SAVED_ADDRESS,
        customerAddressId: '01K7Y7MWNCW7BNBBNTWAB9DYSH',
      },
    });
  });

  it('rejects obsolete pin-confirmation coordinates for a saved address', async () => {
    await expect(
      transform({
        selectedCartItemIds: ['01K7Y7MWNCW7BNBBNTWAB9DYSG'],
        address: {
          source: DeliveryAddressSource.SAVED_ADDRESS,
          customerAddressId: '01K7Y7MWNCW7BNBBNTWAB9DYSH',
          confirmedLatitude: 10.0452,
          confirmedLongitude: 105.7469,
        },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it.each([
    ['missing source', { customerAddressId: '01K7Y7MWNCW7BNBBNTWAB9DYSH' }],
    [
      'invalid source',
      {
        source: 'LEGACY_ADDRESS',
        customerAddressId: '01K7Y7MWNCW7BNBBNTWAB9DYSH',
      },
    ],
    ['missing customerAddressId', { source: 'SAVED_ADDRESS' }],
    [
      'current-location field on saved address',
      {
        source: 'SAVED_ADDRESS',
        customerAddressId: '01K7Y7MWNCW7BNBBNTWAB9DYSH',
        provinceName: 'Cần Thơ',
      },
    ],
  ])('rejects %s', async (_caseName, address) => {
    await expect(
      transform({
        selectedCartItemIds: ['01K7Y7MWNCW7BNBBNTWAB9DYSG'],
        address,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

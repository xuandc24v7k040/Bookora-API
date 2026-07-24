import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ThrottlerGuard } from '@nestjs/throttler';

import { CsrfGuard } from '@/modules/auth/guards/csrf.guard';
import { JwtAccessGuard } from '@/modules/auth/guards/jwt-access.guard';
import type { AuthenticatedUser } from '@/modules/auth/types/authenticated-user.type';
import { CheckoutController } from './checkout.controller';
import type { CheckoutService } from './checkout.service';

describe('CheckoutController', () => {
  it('keeps current-location reverse customer-authenticated and separately rate limited', async () => {
    const reverseCurrentLocation = jest.fn().mockResolvedValue({
      address: 'Phường Long Bình, Thành phố Cần Thơ',
      province: 'Thành phố Cần Thơ',
      provinceCode: 92,
      ward: 'Phường Long Bình',
      wardCode: 31117,
    });
    const service = { reverseCurrentLocation } as unknown as CheckoutService;
    const controller = new CheckoutController(service);
    const actor = { id: 'customer-id' } as unknown as AuthenticatedUser;
    const query = { latitude: 9.683842, longitude: 105.569568 };

    await expect(
      controller.reverseCurrentLocation(actor, query),
    ).resolves.toMatchObject({
      provinceCode: 92,
      wardCode: 31117,
    });
    expect(reverseCurrentLocation).toHaveBeenCalledWith(actor, query);

    const controllerGuards = Reflect.getMetadata(
      GUARDS_METADATA,
      CheckoutController,
    ) as unknown[];
    const routeHandler = Object.getOwnPropertyDescriptor(
      CheckoutController.prototype,
      'reverseCurrentLocation',
    )?.value as object;
    const routeGuards = Reflect.getMetadata(
      GUARDS_METADATA,
      routeHandler,
    ) as unknown[];

    expect(controllerGuards).toEqual(
      expect.arrayContaining([JwtAccessGuard, CsrfGuard]),
    );
    expect(routeGuards).toEqual(expect.arrayContaining([ThrottlerGuard]));
  });
});

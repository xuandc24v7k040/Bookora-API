import { INestApplication, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

describe('PaymentsController VNPAY Return routing', () => {
  let app: INestApplication;
  const service = {
    buildReturnRedirect: jest
      .fn()
      .mockResolvedValue(
        'http://localhost:5173/checkout/payment-result?paymentId=payment-public-id&returnResult=success',
      ),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [PaymentsController],
      providers: [{ provide: PaymentsService, useValue: service }],
    }).compile();
    app = moduleRef.createNestApplication();
    app.enableVersioning({
      type: VersioningType.URI,
      defaultVersion: '1',
    });
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves GET /api/v1/payments/vnpay/return as a 302 redirect', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/payments/vnpay/return?vnp_TxnRef=BK01TEST')
      .expect(302);

    expect(response.headers.location).toBe(
      'http://localhost:5173/checkout/payment-result?paymentId=payment-public-id&returnResult=success',
    );
    expect(service.buildReturnRedirect).toHaveBeenCalledWith(
      expect.objectContaining({ vnp_TxnRef: 'BK01TEST' }),
    );
  });
});

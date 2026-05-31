import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { setupApplication } from './../src/core/app.setup';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    setupApplication(app);
    await app.init();
  });

  it('/api/v1/health (GET)', () => {
    return request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200)
      .expect(({ body }) => {
        const response = body as { data: { timestamp: unknown } };

        expect(body).toMatchObject({
          statusCode: 200,
          message: 'Kiểm tra trạng thái thành công',
          data: {
            name: 'Exam API',
            status: 'ok',
          },
        });
        expect(typeof response.data.timestamp).toBe('string');
      });
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });
});

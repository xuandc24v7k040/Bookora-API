import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

describe('HealthController', () => {
  let healthController: HealthController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        HealthService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('Exam API'),
          },
        },
      ],
    }).compile();

    healthController = app.get<HealthController>(HealthController);
  });

  describe('root', () => {
    it('should return health status', () => {
      const response = healthController.getHealth();

      expect(response.name).toBe('Exam API');
      expect(response.status).toBe('ok');
      expect(typeof response.timestamp).toBe('string');
    });
  });
});

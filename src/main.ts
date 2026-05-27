import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { WinstonModule } from 'nest-winston';
import { AppModule } from '@/app.module';
import { setupApplication } from '@/core/app.setup';
import { winstonConfig } from '@/core/logger';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule, {
    logger: WinstonModule.createLogger(winstonConfig),
  });
  const configService = app.get(ConfigService);
  const port = configService.get<number>('app.port') ?? 8000;

  setupApplication(app);
  app.enableShutdownHooks();

  await app.listen(port);
  logger.log(`Application is running on: ${await app.getUrl()}`);
}
void bootstrap();

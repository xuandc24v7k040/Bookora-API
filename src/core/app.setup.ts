import {
  BadRequestException,
  type INestApplication,
  ValidationPipe,
  VersioningType,
  type ValidationError,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { createValidationExceptionResponse } from '../common/utils';
import { AllExceptionsFilter } from './filters';
import { TransformInterceptor } from './interceptors';
import { setupSwagger } from './swagger.setup';

export function setupApplication(app: INestApplication): void {
  const configService = app.get(ConfigService);
  const apiPrefix = configService.get<string>('app.apiPrefix') ?? 'api';
  const corsOrigin = configService.get<string>('app.corsOrigin') ?? '*';

  app.use(helmet());
  app.use(compression());
  app.use(cookieParser(configService.get<string>('cookie.secret')));
  app.enableCors({
    origin: parseCorsOrigin(corsOrigin),
    credentials: true,
  });

  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  app.setGlobalPrefix(apiPrefix);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      exceptionFactory: (validationErrors: ValidationError[] = []) =>
        new BadRequestException(
          createValidationExceptionResponse(validationErrors),
        ),
    }),
  );

  app.useGlobalInterceptors(new TransformInterceptor(app.get(Reflector)));
  app.useGlobalFilters(new AllExceptionsFilter());
  setupSwagger(app);
}

function parseCorsOrigin(origin: string): string | string[] | boolean {
  if (origin === '*') {
    return true;
  }

  return origin.split(',').map((item) => item.trim());
}

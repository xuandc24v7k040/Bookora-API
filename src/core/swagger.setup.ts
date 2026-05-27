import { type INestApplication } from '@nestjs/common';
import {
  DocumentBuilder,
  SwaggerDocumentOptions,
  SwaggerModule,
  type OpenAPIObject,
} from '@nestjs/swagger';

function createSwaggerConfig() {
  return new DocumentBuilder()
    .setTitle('Bookra API')
    .setDescription('API documentation for the Bookra project')
    .setVersion('1.0')
    .addTag('health')
    .addTag('users')
    .addTag('auth')
    .build();
}

export function createSwaggerDocument(app: INestApplication): OpenAPIObject {
  const options: SwaggerDocumentOptions = {
    operationIdFactory: (controllerKey: string, methodKey: string) => {
      const controller = controllerKey
        .replace(/Controller$/, '')
        .replace(/^App$/, '');

      return `${controller.charAt(0).toLowerCase()}${controller.slice(1)}${methodKey.charAt(0).toUpperCase()}${methodKey.slice(1)}`;
    },
  };

  return SwaggerModule.createDocument(app, createSwaggerConfig(), options);
}

export function setupSwagger(app: INestApplication): void {
  const document = createSwaggerDocument(app);

  SwaggerModule.setup('api/docs', app, document, {
    jsonDocumentUrl: 'api/docs-json',
    swaggerOptions: {
      persistAuthorization: true,
    },
  });
}

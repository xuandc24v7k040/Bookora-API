import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '@/app.module';
import { createSwaggerDocument } from '@/core/swagger.setup';

async function exportOpenApi() {
  const app = await NestFactory.create(AppModule, { logger: false });
  const document = createSwaggerDocument(app);
  const outputDir = join(process.cwd(), 'docs');
  const outputPath = join(outputDir, 'openapi.json');

  mkdirSync(outputDir, { recursive: true });
  writeFileSync(outputPath, JSON.stringify(document, null, 2));

  await app.close();
}

void exportOpenApi();

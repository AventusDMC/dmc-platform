import * as dotenv from 'dotenv';
dotenv.config();
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { AppModule } from './app.module';

const { json, urlencoded } = require('express');

function getCorsOrigins() {
  const configured = (process.env.CORS_ORIGINS || process.env.ADMIN_WEB_URL || process.env.NEXT_PUBLIC_APP_URL || '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean);

  return Array.from(new Set(['http://localhost:3000', ...configured]));
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.use(json({ limit: '25mb' }));
  app.use(urlencoded({ extended: true, limit: '25mb' }));
  app.enableCors({
    origin: getCorsOrigins(),
    credentials: true,
  });
  app.useStaticAssets(join(process.cwd(), 'apps', 'api', 'uploads'), {
    prefix: '/uploads/',
  });
  const port = process.env.PORT || 3001;
  await app.listen(port);
}
bootstrap();

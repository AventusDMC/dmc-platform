import * as dotenv from 'dotenv';
dotenv.config();
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { AppModule } from './app.module';

const { json, urlencoded } = require('express');

function logBootstrapError(phase: string, error: unknown) {
  console.error('[serverless-bootstrap] error', {
    phase,
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    name: error instanceof Error ? error.name : undefined,
  });
}

export function getCorsOrigins() {
  const configured = (process.env.CORS_ORIGINS || process.env.ADMIN_WEB_URL || process.env.NEXT_PUBLIC_APP_URL || '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean);

  return Array.from(new Set(['http://localhost:3000', 'https://dmc-platform-admin-web.vercel.app', ...configured]));
}

export async function createNestApp() {
  console.info('[serverless-bootstrap] before NestFactory.create', {
    nodeEnv: process.env.NODE_ENV,
    vercel: process.env.VERCEL,
    hasDatabaseUrl: Boolean(process.env.DATABASE_URL),
  });

  let app: NestExpressApplication;

  try {
    app = await NestFactory.create<NestExpressApplication>(AppModule);
  } catch (error) {
    logBootstrapError('NestFactory.create', error);
    throw error;
  }

  console.info('[serverless-bootstrap] after NestFactory.create');

  try {
    app.use(json({ limit: '25mb' }));
    app.use(urlencoded({ extended: true, limit: '25mb' }));
    app.enableCors({
      origin: getCorsOrigins(),
      credentials: true,
    });
    app.useStaticAssets(join(process.cwd(), 'apps', 'api', 'uploads'), {
      prefix: '/uploads/',
    });
  } catch (error) {
    logBootstrapError('configure app', error);
    throw error;
  }

  return app;
}

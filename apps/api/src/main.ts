import * as dotenv from 'dotenv';
dotenv.config();
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.enableCors({
    origin: 'http://localhost:3000',
  });
  app.useStaticAssets(join(process.cwd(), 'apps', 'api', 'uploads'), {
    prefix: '/uploads/',
  });
  await app.listen(3001);
}

void bootstrap();

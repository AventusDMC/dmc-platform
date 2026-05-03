import { createNestApp } from './nest-app';

async function bootstrap() {
  const app = await createNestApp();
  const port = process.env.PORT || 3001;
  await app.listen(port);
}
bootstrap();

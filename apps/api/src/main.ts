import { createNestApp } from './nest-app';

async function bootstrap() {
  const app = await createNestApp();
  const port = Number(process.env.PORT) || 8080;
  await app.listen(port, '0.0.0.0');
  console.log(`API running on port ${port}`);
}

bootstrap().catch((error) => {
  console.error('API startup failed', error);
  process.exit(1);
});

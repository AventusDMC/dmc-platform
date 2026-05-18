import { createNestApp } from './nest-app';

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception', error);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection', reason);
});

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

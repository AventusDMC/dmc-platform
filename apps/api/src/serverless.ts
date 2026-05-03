import { createNestApp } from './nest-app';

type ServerlessHandler = (request: unknown, response: unknown) => void;

let cachedServer: ServerlessHandler | null = null;

function logServerlessError(phase: string, error: unknown) {
  console.error('[serverless-bootstrap] error', {
    phase,
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    name: error instanceof Error ? error.name : undefined,
  });
}

async function getServer() {
  if (!cachedServer) {
    console.info('[serverless-bootstrap] cache miss: creating Nest app');
    const app = await createNestApp();

    console.info('[serverless-bootstrap] before app.init', {
      hasDatabaseUrl: Boolean(process.env.DATABASE_URL),
      vercel: process.env.VERCEL,
    });

    try {
      await app.init();
    } catch (error) {
      logServerlessError('app.init', error);
      throw error;
    }

    console.info('[serverless-bootstrap] after app.init');
    cachedServer = app.getHttpAdapter().getInstance() as ServerlessHandler;
    console.info('[serverless-bootstrap] handler cached');
  }

  return cachedServer;
}

export default async function handler(request: unknown, response: unknown) {
  console.info('[serverless-bootstrap] before handler returns');

  try {
    const server = await getServer();
    return server(request, response);
  } catch (error) {
    logServerlessError('handler', error);
    throw error;
  }
}

import type { IncomingMessage, ServerResponse } from 'http';
import serverless = require('serverless-http');
import { createExpressServer, createNestApp } from './nest-app';

type ServerlessHandler = (request: IncomingMessage, response: ServerResponse) => Promise<unknown>;

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
    const expressServer = createExpressServer();
    const app = await createNestApp(expressServer);

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
    cachedServer = serverless(expressServer) as unknown as ServerlessHandler;
    console.info('[serverless-bootstrap] handler cached');
  }

  return cachedServer;
}

export default async function handler(request: IncomingMessage, response: ServerResponse) {
  console.info('[serverless-bootstrap] before handler returns');

  try {
    const serverlessHandler = await getServer();
    return serverlessHandler(request, response);
  } catch (error) {
    logServerlessError('handler', error);
    throw error;
  }
}

import type { IncomingMessage, ServerResponse } from 'http';
import { createExpressServer, createNestApp, type ExpressServer } from './nest-app';

let cachedServer: ExpressServer | null = null;

function logServerlessError(phase: string, error: unknown) {
  console.error('[serverless-bootstrap] error', {
    phase,
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    name: error instanceof Error ? error.name : undefined,
  });
}

function logHandlerError(error: unknown) {
  console.error('[serverless-handler-error]', {
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
    await new Promise((resolve) => setImmediate(resolve));
    console.info('[serverless-bootstrap] after app.init settled');
    cachedServer = expressServer;
    console.info('[serverless-bootstrap] handler cached');
  }

  return cachedServer;
}

export default async function handler(request: IncomingMessage, response: ServerResponse) {
  console.info('[serverless-bootstrap] before handler returns');

  const logRequestError = (error: Error) => logHandlerError(error);
  request.once('error', logRequestError);
  response.once('error', logRequestError);

  try {
    const expressApp = await getServer();
    return await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        request.off('error', reject);
        response.off('error', reject);
        response.off('finish', onFinish);
      };
      const onFinish = () => {
        cleanup();
        resolve();
      };

      request.once('error', reject);
      response.once('error', reject);
      response.once('finish', onFinish);
      expressApp(request, response);
    });
  } catch (error) {
    logHandlerError(error);
    logServerlessError('handler', error);
    throw error;
  } finally {
    request.off('error', logRequestError);
    response.off('error', logRequestError);
  }
}

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'http';
import { createExpressServer, createNestApp } from './nest-app';

let cachedServer: Server | null = null;

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
    const expressServer = createExpressServer();
    const app = await createNestApp(expressServer);

    try {
      await app.init();
    } catch (error) {
      logServerlessError('app.init', error);
      throw error;
    }

    await new Promise((resolve) => setImmediate(resolve));
    cachedServer = createServer(expressServer);
  }

  return cachedServer;
}

export default async function handler(request: IncomingMessage, response: ServerResponse) {
  const logRequestError = (error: Error) => logHandlerError(error);
  request.once('error', logRequestError);
  response.once('error', logRequestError);

  try {
    const server = await getServer();
    server.emit('request', request, response);
  } catch (error) {
    logHandlerError(error);
    logServerlessError('handler', error);
    throw error;
  } finally {
    request.off('error', logRequestError);
    response.off('error', logRequestError);
  }
}

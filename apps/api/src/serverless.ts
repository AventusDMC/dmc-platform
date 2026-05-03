import { createNestApp } from './nest-app';

type ServerlessHandler = (request: unknown, response: unknown) => void;

let cachedServer: ServerlessHandler | null = null;

async function getServer() {
  if (!cachedServer) {
    const app = await createNestApp();
    await app.init();
    cachedServer = app.getHttpAdapter().getInstance() as ServerlessHandler;
  }

  return cachedServer;
}

export default async function handler(request: unknown, response: unknown) {
  const server = await getServer();
  return server(request, response);
}

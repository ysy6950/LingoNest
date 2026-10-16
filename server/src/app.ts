import express from 'express';

export function createApp() {
  const app = express();

  app.get('/health', (_request, response) => {
    response.json({ status: 'ok', service: 'lingonest-local-server' });
  });

  return app;
}

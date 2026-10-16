import { createApp } from './app.js';

const host = '127.0.0.1';
const port = Number(process.env.PORT ?? 3000);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535');
}

createApp().listen(port, host, () => {
  console.log(`LingoNest local server: http://${host}:${port}/health`);
});

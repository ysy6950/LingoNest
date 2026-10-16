import { createApp } from './app.js';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openBackupStore } from './backupStore.js';

const host = '127.0.0.1';
const port = Number(process.env.PORT ?? 3000);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535');
}

const serverRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const databasePath = process.env.LINGONEST_DB_PATH ?? resolve(serverRoot, 'data', 'lingonest.sqlite');
const backupStore = openBackupStore(databasePath);

createApp(backupStore).listen(port, host, () => {
  console.log(`LingoNest local server: http://${host}:${port}/health`);
});

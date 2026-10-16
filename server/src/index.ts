import { createApp } from './app.js';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openBackupStore } from './backupStore.js';
import { isPrivateLanIpv4 } from './network.js';

const lanIp = process.env.LINGONEST_LAN_IP?.trim() || undefined;
if (lanIp && !isPrivateLanIpv4(lanIp)) {
  throw new Error('LINGONEST_LAN_IP must be a private IPv4 address on this computer');
}
const host = lanIp ?? '127.0.0.1';
const port = Number(process.env.PORT ?? 3000);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535');
}

const serverRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const databasePath = process.env.LINGONEST_DB_PATH ?? resolve(serverRoot, 'data', 'lingonest.sqlite');
// A LAN listener has no authentication yet, so expose health checks only.
const backupStore = lanIp ? undefined : openBackupStore(databasePath);

createApp(backupStore, Boolean(lanIp)).listen(port, host, () => {
  console.log(`LingoNest ${lanIp ? 'LAN health-only' : 'local backup'} server: http://${host}:${port}/health`);
});

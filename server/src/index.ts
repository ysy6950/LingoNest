import { createApp } from './app.js';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openBackupStore } from './backupStore.js';
import { isPrivateLanIpv4 } from './network.js';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { createAiService, getAiConfigState, readAiConfig } from './ai.js';
import { createDictionaryService, getDictionaryConfigState, readDictionaryConfig } from './dictionary.js';

const serverRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const serverEnvPath = resolve(serverRoot, '.env');
if (existsSync(serverEnvPath)) loadEnvFile(serverEnvPath);

const lanIp = process.env.LINGONEST_LAN_IP?.trim() || undefined;
if (lanIp && !isPrivateLanIpv4(lanIp)) {
  throw new Error('LINGONEST_LAN_IP must be a private IPv4 address on this computer');
}
const host = lanIp ?? '127.0.0.1';
const lanBackup = process.env.LINGONEST_LAN_BACKUP === '1';
if (lanBackup && !lanIp) throw new Error('LAN backup requires LINGONEST_LAN_IP');
const backupToken = lanBackup ? randomBytes(16).toString('hex') : undefined;
const port = Number(process.env.PORT ?? 3000);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535');
}

const databasePath = process.env.LINGONEST_DB_PATH ?? resolve(serverRoot, 'data', 'lingonest.sqlite');
// LAN defaults to health-only. Backup access must be explicitly enabled and paired.
const backupStore = lanIp && !lanBackup ? undefined : openBackupStore(databasePath);
const aiConfig = readAiConfig();
const aiService = createAiService(aiConfig, getAiConfigState());
const dictionaryConfig = readDictionaryConfig();
const dictionaryService = createDictionaryService(dictionaryConfig, getDictionaryConfigState());

const listener = createApp(backupStore, { lanHealthOnly: Boolean(lanIp && !lanBackup), backupToken, aiService, dictionaryService }).listen(port, host, () => {
  console.log(`LingoNest ${lanBackup ? 'LAN backup' : lanIp ? 'LAN health-only' : 'local backup'} server: http://${host}:${port}/health`);
  if (backupToken) console.log(`Temporary pairing code (do not share or commit): ${backupToken}`);
  console.log(`AI configuration: ${aiService.state}`);
  console.log(`Dictionary configuration: ${dictionaryService.state}`);
});

listener.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${port} is already in use. Stop the old LingoNest server or choose another PORT.`);
  } else {
    console.error(error);
  }
  backupStore?.close();
  process.exitCode = 1;
});

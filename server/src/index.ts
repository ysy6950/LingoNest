import { createApp } from './app.js';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openBackupStore } from './backupStore.js';
import { isPrivateLanIpv4 } from './network.js';
import { randomBytes } from 'node:crypto';
import { createServer as createHttpsServer } from 'node:https';
import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { createAiService, getAiConfigState, readAiConfig } from './ai.js';
import { createDictionaryService, getDictionaryConfigState, readDictionaryConfig } from './dictionary.js';
import { readLanTlsOptions } from './lanTls.js';
import { openAccountStore } from './accountStore.js';

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
const lanTls = process.env.LINGONEST_LAN_TLS === '1';
if (lanTls && !lanIp) throw new Error('LAN HTTPS requires LINGONEST_LAN_IP');
if (process.env.LINGONEST_ACCOUNTS !== undefined && !['0', '1'].includes(process.env.LINGONEST_ACCOUNTS)) {
  throw new Error('LINGONEST_ACCOUNTS must be 0 or 1');
}
const accountsEnabled = process.env.LINGONEST_ACCOUNTS === '1';
if (accountsEnabled && (!lanIp || !lanBackup || !lanTls)) throw new Error('Account mode requires LAN IP, LAN backup and HTTPS');
const backupToken = lanBackup && !accountsEnabled ? randomBytes(16).toString('hex') : undefined;
const port = Number(process.env.PORT ?? 3000);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535');
}

const databasePath = process.env.LINGONEST_DB_PATH ?? resolve(serverRoot, 'data', 'lingonest.sqlite');
// LAN defaults to health-only. Backup access must be explicitly enabled and paired.
const backupStore = lanIp && !lanBackup ? undefined : openBackupStore(databasePath);
const accountStore = accountsEnabled ? openAccountStore(databasePath) : undefined;
const aiConfig = readAiConfig();
const aiService = createAiService(aiConfig, getAiConfigState());
const dictionaryConfig = readDictionaryConfig();
const dictionaryService = createDictionaryService(dictionaryConfig, getDictionaryConfigState());

const app = createApp(backupStore, { lanHealthOnly: Boolean(lanIp && !lanBackup), backupToken, accountStore, aiService, dictionaryService });
const listener = (lanTls ? createHttpsServer(readLanTlsOptions(lanIp!, serverRoot), app) : app).listen(port, host, () => {
  console.log(`LingoNest ${lanBackup ? 'LAN backup' : lanIp ? 'LAN health-only' : 'local backup'} server: ${lanTls ? 'https' : 'http'}://${host}:${port}/health`);
  if (backupToken) console.log(`Temporary pairing code (do not share or commit): ${backupToken}`);
  if (accountStore) console.log('Account mode: enabled (session authentication required)');
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
  accountStore?.close();
  process.exitCode = 1;
});

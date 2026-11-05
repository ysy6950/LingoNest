import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { openAccountStore, validUsername } from './accountStore.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
if (existsSync(resolve(root, '.env'))) loadEnvFile(resolve(root, '.env'));
const path = process.env.LINGONEST_DB_PATH ?? resolve(root, 'data', 'lingonest.sqlite');
const [command, ...args] = process.argv.slice(2);
if (!command || command === 'help') {
  console.log('Usage: npm.cmd run accounts -- invite-admin | invite-member | reset USERNAME | claim-legacy USERNAME SERVER_ID REVISION | list');
  process.exit(0);
}
const store = openAccountStore(path);
try {
  if (command === 'invite-admin' && args.length === 0) {
    console.log(`Admin invitation (show once, share privately): ${store.createInvitation('admin')}`);
  } else if (command === 'invite-member' && args.length === 0) {
    console.log(`Member invitation (show once, share privately): ${store.createInvitation('member')}`);
  } else if (command === 'list' && args.length === 0) {
    console.table(store.listAccounts());
  } else if (command === 'reset' && args.length === 1 && validUsername(args[0])) {
    const account = store.findAccount(args[0]);
    if (!account) throw new Error('account_not_found');
    console.log(`Password reset token (30 minutes, show once): ${store.createReset(account.id)}`);
  } else if (command === 'claim-legacy' && args.length === 3 && validUsername(args[0]) && args[1] === store.serverId && /^\d+$/.test(args[2])) {
    const account = store.findAccount(args[0]);
    if (!account || account.role !== 'admin') throw new Error('admin_account_not_found');
    if (!store.claimLegacyBackup(account.id, Number(args[2]))) throw new Error('legacy_missing_or_revision_changed_or_account_backup_exists');
    console.log(`Copied legacy backup to ${account.username}; original backup retained.`);
  } else throw new Error('invalid_command_or_arguments');
} catch (error) {
  console.error(error instanceof Error ? error.message : 'account_command_failed');
  process.exitCode = 1;
} finally {
  store.close();
}

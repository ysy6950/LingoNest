import express from 'express';
import { timingSafeEqual } from 'node:crypto';
import type { BackupStore } from './backupStore.js';
import { isValidSnapshot, MAX_SNAPSHOT_BYTES } from './snapshot.js';

export function createApp(backupStore?: BackupStore, options: { lanHealthOnly?: boolean; backupToken?: string } = {}) {
  const app = express();
  const { lanHealthOnly, backupToken } = options;
  // Authenticate before parsing backup bodies. Never log the credential.
  if (backupToken) app.use('/backup', (request, response, next) => {
    const supplied = Buffer.from(request.get('authorization') ?? '');
    const expected = Buffer.from(`Bearer ${backupToken}`);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
      response.status(401).json({ error: 'unauthorized' });
      return;
    }
    next();
  });
  app.use(express.json({ limit: '6mb' }));

  app.get('/health', (_request, response) => {
    response.json({
      status: 'ok',
      service: 'lingonest-local-server',
      ...(lanHealthOnly ? { mode: 'lan-health-only' } : backupToken ? { mode: 'lan-backup' } : {}),
    });
  });

  if (backupStore && !lanHealthOnly) {
    app.get('/backup', (_request, response) => {
      response.json({ serverId: backupStore.serverId, backup: backupStore.read() });
    });

    app.put('/backup', (request, response) => {
      const { snapshot, expectedRevision } = request.body ?? {};
      // A replacement database may reuse revision 1; identity prevents stale writes to it.
      if ((backupToken || request.body?.expectedServerId !== undefined) && request.body?.expectedServerId !== backupStore.serverId) {
        response.status(409).json({ error: 'server_changed' });
        return;
      }
      if (
        !Number.isSafeInteger(expectedRevision) || expectedRevision < 0 ||
        !isValidSnapshot(snapshot)
      ) {
        response.status(400).json({ error: 'invalid_backup' });
        return;
      }
      if (Buffer.byteLength(JSON.stringify(snapshot), 'utf8') > MAX_SNAPSHOT_BYTES) {
        response.status(413).json({ error: 'backup_too_large' });
        return;
      }

      const saved = backupStore.save(snapshot, expectedRevision);
      if (!saved) {
        response.status(409).json({ error: 'revision_conflict' });
        return;
      }
      response.json({ serverId: backupStore.serverId, backup: saved });
    });
  }

  app.use((error: unknown, _request: express.Request, response: express.Response, next: express.NextFunction) => {
    if (error instanceof SyntaxError && 'body' in error) {
      response.status(400).json({ error: 'invalid_json' });
      return;
    }
    if (error instanceof Error && 'type' in error && error.type === 'entity.too.large') {
      response.status(413).json({ error: 'backup_too_large' });
      return;
    }
    next(error);
  });

  return app;
}

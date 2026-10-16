import express from 'express';
import type { BackupStore } from './backupStore.js';
import { isValidSnapshot, MAX_SNAPSHOT_BYTES } from './snapshot.js';

export function createApp(backupStore?: BackupStore, lanHealthOnly = false) {
  const app = express();
  app.use(express.json({ limit: '6mb' }));

  app.get('/health', (_request, response) => {
    response.json({
      status: 'ok',
      service: 'lingonest-local-server',
      ...(lanHealthOnly ? { mode: 'lan-health-only' } : {}),
    });
  });

  if (backupStore) {
    app.get('/backup', (_request, response) => {
      response.json({ backup: backupStore.read() });
    });

    app.put('/backup', (request, response) => {
      const { snapshot, expectedRevision } = request.body ?? {};
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
      response.json({ backup: saved });
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

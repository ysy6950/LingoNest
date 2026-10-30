import express from 'express';
import { timingSafeEqual } from 'node:crypto';
import type { BackupStore } from './backupStore.js';
import { isValidSnapshot, MAX_SNAPSHOT_BYTES } from './snapshot.js';
import type { AiService } from './ai.js';
import { AiServiceError, getAiConfigState } from './ai.js';
import type { DictionaryService } from './dictionary.js';
import { DictionaryServiceError, getDictionaryConfigState } from './dictionary.js';

export function createApp(backupStore?: BackupStore, options: { lanHealthOnly?: boolean; backupToken?: string; aiService?: AiService; dictionaryService?: DictionaryService } = {}) {
  const app = express();
  const { lanHealthOnly, backupToken } = options;
  // Authenticate before parsing backup bodies. Never log the credential.
  if (backupToken) app.use(['/backup', '/ai', '/dictionary'], (request, response, next) => {
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

  app.get('/ai/status', (_request, response) => {
    if (lanHealthOnly) {
      response.status(404).json({ error: 'ai_unavailable_in_health_only_mode' });
      return;
    }
    response.json({ status: options.aiService?.state ?? getAiConfigState() });
  });

  app.get('/ai/usage', (_request, response) => {
    response.set('Cache-Control', 'no-store');
    if (lanHealthOnly) {
      response.status(404).json({ error: 'ai_unavailable_in_health_only_mode' });
      return;
    }
    if (!options.aiService) { response.status(503).json({ error: 'ai_disabled' }); return; }
    response.json(options.aiService.getUsage());
  });

  app.delete('/ai/cache', (_request, response) => {
    response.set('Cache-Control', 'no-store');
    if (lanHealthOnly) {
      response.status(404).json({ error: 'ai_unavailable_in_health_only_mode' });
      return;
    }
    if (!options.aiService) { response.status(503).json({ error: 'ai_disabled' }); return; }
    options.aiService.clearCache();
    response.json(options.aiService.getUsage());
  });

  app.post('/ai/word-analysis', async (request, response) => {
    if (lanHealthOnly) {
      response.status(404).json({ error: 'ai_unavailable_in_health_only_mode' });
      return;
    }
    if (!options.aiService || options.aiService.state !== 'configured') {
      response.status(503).json({ error: 'ai_disabled' });
      return;
    }
    const body = request.body as { word?: unknown; meaning?: unknown };
    if (typeof body?.word !== 'string' || (body.meaning !== undefined && typeof body.meaning !== 'string')) {
      response.status(400).json({ error: 'invalid_request' });
      return;
    }
    try {
      response.json(await options.aiService.analyzeWord({ word: body.word, meaning: body.meaning }));
    } catch (error) {
      if (error instanceof AiServiceError) {
        console.warn(`[AI] request failed: ${error.code}${error.providerStatus ? ` (upstream HTTP ${error.providerStatus})` : ''}`);
        response.status(error.status).json({ error: error.code });
        return;
      }
      console.warn('[AI] request failed: unexpected_error');
      response.status(502).json({ error: 'ai_unavailable' });
    }
  });

  app.post('/ai/related-words', async (request, response) => {
    if (lanHealthOnly) {
      response.status(404).json({ error: 'ai_unavailable_in_health_only_mode' });
      return;
    }
    if (!options.aiService || options.aiService.state !== 'configured') {
      response.status(503).json({ error: 'ai_disabled' });
      return;
    }
    const body = request.body as { word?: unknown; meaning?: unknown };
    if (typeof body?.word !== 'string' || (body.meaning !== undefined && typeof body.meaning !== 'string')) {
      response.status(400).json({ error: 'invalid_request' });
      return;
    }
    const startedAt = Date.now();
    try {
      const recommendations = await options.aiService.recommendWords({ word: body.word, meaning: body.meaning });
      const aiFinishedAt = Date.now();
      const dictionary = options.dictionaryService;
      const candidates = await Promise.all(recommendations.map(async (candidate) => {
        let dictionaryStatus: 'found' | 'not_found' | 'unavailable' | 'not_configured' = 'not_configured';
        if (dictionary?.state === 'configured') {
          try { dictionaryStatus = await dictionary.checkWord(candidate.word); }
          catch (error) {
            dictionaryStatus = error instanceof DictionaryServiceError && error.code === 'not_found' ? 'not_found' : 'unavailable';
            if (dictionaryStatus === 'unavailable') console.warn(`[Dictionary] recommendation check failed: ${error instanceof DictionaryServiceError ? error.code : 'unexpected_error'}`);
          }
        }
        return { ...candidate, dictionaryStatus };
      }));
      console.info(`[AI] recommendation completed: ai=${aiFinishedAt - startedAt}ms dictionary=${Date.now() - aiFinishedAt}ms total=${Date.now() - startedAt}ms`);
      response.json({ candidates });
    } catch (error) {
      if (error instanceof AiServiceError) {
        console.warn(`[AI] recommendation failed: ${error.code} (elapsed=${Date.now() - startedAt}ms)${error.providerStatus ? ` (upstream HTTP ${error.providerStatus})` : ''}`);
        response.status(error.status).json({ error: error.code });
        return;
      }
      console.warn('[AI] recommendation failed: unexpected_error');
      response.status(502).json({ error: 'ai_unavailable' });
    }
  });

  app.post('/ai/exercises', async (request, response) => {
    if (lanHealthOnly) {
      response.status(404).json({ error: 'ai_unavailable_in_health_only_mode' });
      return;
    }
    if (!options.aiService || options.aiService.state !== 'configured') {
      response.status(503).json({ error: 'ai_disabled' });
      return;
    }
    const startedAt = Date.now();
    try {
      const questions = await options.aiService.generateExercises(request.body);
      console.info(`[AI] exercises completed: total=${Date.now() - startedAt}ms questions=${questions.length}`);
      response.json({ questions });
    } catch (error) {
      if (error instanceof AiServiceError) {
        console.warn(`[AI] exercises failed: ${error.code} (elapsed=${Date.now() - startedAt}ms)${error.providerStatus ? ` (upstream HTTP ${error.providerStatus})` : ''}`);
        response.status(error.status).json({ error: error.code });
        return;
      }
      console.warn('[AI] exercises failed: unexpected_error');
      response.status(502).json({ error: 'ai_unavailable' });
    }
  });

  app.get('/dictionary/status', (_request, response) => {
    if (lanHealthOnly) {
      response.status(404).json({ error: 'dictionary_unavailable_in_health_only_mode' });
      return;
    }
    response.json({ status: options.dictionaryService?.state ?? getDictionaryConfigState() });
  });

  app.post('/dictionary/word', async (request, response) => {
    if (lanHealthOnly) {
      response.status(404).json({ error: 'dictionary_unavailable_in_health_only_mode' });
      return;
    }
    if (!options.dictionaryService || options.dictionaryService.state !== 'configured') {
      response.status(503).json({ error: 'dictionary_disabled' });
      return;
    }
    const body = request.body as { word?: unknown };
    if (typeof body?.word !== 'string' || !body.word.trim() || body.word.length > 100) {
      response.status(400).json({ error: 'invalid_request' });
      return;
    }
    try {
      response.json(await options.dictionaryService.lookupWord(body.word));
    } catch (error) {
      if (error instanceof DictionaryServiceError) {
        console.warn(`[Dictionary] request failed: ${error.code}${error.providerStatus ? ` (upstream HTTP ${error.providerStatus})` : ''}`);
        response.status(error.status).json({ error: error.code });
        return;
      }
      console.warn('[Dictionary] request failed: unexpected_error');
      response.status(502).json({ error: 'provider_error' });
    }
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

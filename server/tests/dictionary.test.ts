import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { createDictionaryService, dictionaryUrl, getDictionaryConfigState, readDictionaryConfig, DictionaryServiceError } from '../src/dictionary.js';
import { createApp } from '../src/app.js';
import { isValidSnapshot } from '../src/snapshot.js';
import { websterAudioUrl, normalizeWebsterAudioUrl } from '../src/websterAudio.js';

const config = { apiKey: 'dictionary-secret', baseUrl: 'http://127.0.0.1:4568/api', timeoutMs: 20 };

test('v3 backup accepts a saved IPA but rejects incomplete pronunciation', () => {
  const snapshot = { version: 3, cards: [{ id: 1, word: 'learn', meaning: '学习', groupId: 1, createdAt: 100,
    pronunciation: { ipa: 'ˈlɜːrn', partOfSpeech: 'verb', source: 'merriam-webster-learners', fetchedAt: 100 } }],
    groups: [{ id: 1, name: '默认组' }], reviews: { 1: { stage: 0, dueAt: 0, lastReviewedAt: null, lastResult: null, reviewCount: 0 } }, selectedGroupId: 1 };
  assert.equal(isValidSnapshot(snapshot), true);
  assert.equal(isValidSnapshot({ ...snapshot, cards: [{ ...snapshot.cards[0], pronunciation: { source: 'merriam-webster-learners' } }] }), false);
});

test('dictionary config is disabled, configured, or misconfigured without exposing the key', () => {
  assert.equal(getDictionaryConfigState({}), 'disabled');
  assert.equal(getDictionaryConfigState({ LINGONEST_WEBSTER_KEY: config.apiKey }), 'configured');
  assert.equal(getDictionaryConfigState({ LINGONEST_WEBSTER_KEY: config.apiKey, LINGONEST_WEBSTER_BASE_URL: 'http://192.168.1.2/api' }), 'misconfigured');
  assert.equal(readDictionaryConfig({ LINGONEST_WEBSTER_KEY: config.apiKey, LINGONEST_WEBSTER_BASE_URL: config.baseUrl })?.apiKey, config.apiKey);
  const url = dictionaryUrl(config, 'learn words');
  assert.equal(new URL(url).pathname, '/api/learn%20words');
  assert.equal(new URL(url).searchParams.get('key'), config.apiKey);
});

test('dictionary service extracts pronunciation, part of speech, and safe US audio without returning provider data', async () => {
  let requested = '';
  const service = createDictionaryService(config, 'configured', async (url) => {
    requested = String(url);
    return new Response(JSON.stringify([{ hwi: { prs: [{ ipa: 'ˈlɜːrn', sound: { audio: 'learn0001' } }] }, fl: 'verb', def: [] }]), { status: 200 });
  });
  const result = await service.lookupWord(' learn ');
  assert.deepEqual({ ipa: result.ipa, partOfSpeech: result.partOfSpeech, audioUrl: result.audioUrl, audioAccent: result.audioAccent, source: result.source }, {
    ipa: 'ˈlɜːrn', partOfSpeech: 'verb', audioUrl: 'https://media.merriam-webster.com/audio/prons/en/us/mp3/l/learn0001.mp3', audioAccent: 'us', source: 'merriam-webster-learners',
  });
  assert.equal(new URL(requested).searchParams.get('key'), config.apiKey);
});

test('dictionary service ignores unsafe provider audio names', async () => {
  const service = createDictionaryService(config, 'configured', async () => new Response(JSON.stringify([{ hwi: { prs: [{ ipa: 'ˈlɜːrn', sound: { audio: '../secret' } }] }, fl: 'verb' }]), { status: 200 }));
  const result = await service.lookupWord('learn');
  assert.equal(result.audioUrl, undefined);
  assert.equal(result.audioAccent, undefined);
});

test('official audio subdirectories and legacy repair keep the media host restricted', () => {
  const root = 'https://media.merriam-webster.com/audio/prons/en/us/mp3/';
  for (const [name, directory] of [['pajama02', 'p'], ['bix00001', 'bix'], ['gg000001', 'gg'], ['3d000001', 'number'], ['_word01', 'number'], ['-word01', 'number']]) {
    const canonical = `${root}${directory}/${name}.mp3`;
    assert.equal(websterAudioUrl(name), canonical);
    assert.equal(normalizeWebsterAudioUrl(canonical), canonical);
    assert.equal(normalizeWebsterAudioUrl(`${root}${name}.mp3`), canonical);
  }
  for (const path of ['x/pajama02.mp3', 'p/../pajama02.mp3', 'p/pajama02.mp3?key=secret', 'p/pajama02.mp3#test']) {
    assert.equal(normalizeWebsterAudioUrl(root + path), null);
  }
  assert.equal(websterAudioUrl('../word'), null);
  assert.equal(normalizeWebsterAudioUrl('https://evil.example/pajama02.mp3'), null);
});

test('dictionary service classifies provider failures safely', async () => {
  for (const [status, code] of [[401, 'provider_auth'], [404, 'not_found'], [500, 'provider_error']] as const) {
    const service = createDictionaryService(config, 'configured', async () => new Response('secret provider body', { status }));
    await assert.rejects(() => service.lookupWord('learn'), (error: unknown) => error instanceof DictionaryServiceError && error.code === code && !error.message.includes('secret'));
  }
  const malformed = createDictionaryService(config, 'configured', async () => new Response(JSON.stringify([{ fl: 'verb' }]), { status: 200 }));
  await assert.rejects(() => malformed.lookupWord('learn'), (error: unknown) => error instanceof DictionaryServiceError && error.code === 'not_found');
  const invalidKey = createDictionaryService(config, 'configured', async () => new Response('Invalid API key. Please check your subscription.', { status: 200 }));
  await assert.rejects(() => invalidKey.lookupWord('learn'), (error: unknown) => error instanceof DictionaryServiceError && error.code === 'provider_auth');
  const invalidJson = createDictionaryService(config, 'configured', async () => new Response('temporary text', { status: 200 }));
  await assert.rejects(() => invalidJson.lookupWord('learn'), (error: unknown) => error instanceof DictionaryServiceError && error.code === 'invalid_response');
});

test('dictionary route requires pairing and is disabled without a configured key', async () => {
  const disabled = createApp(undefined, { dictionaryService: createDictionaryService(null) }).listen(0, '127.0.0.1');
  const paired = createApp(undefined, {
    backupToken: 'a'.repeat(32),
    dictionaryService: createDictionaryService(config, 'configured', async () => new Response(JSON.stringify([{ hwi: { prs: [{ ipa: 'ˈlɜːrn' }] }, fl: 'verb' }]), { status: 200 })),
  }).listen(0, '127.0.0.1');
  await Promise.all([once(disabled, 'listening'), once(paired, 'listening')]);
  try {
    const disabledUrl = `http://127.0.0.1:${(disabled.address() as { port: number }).port}`;
    const pairedUrl = `http://127.0.0.1:${(paired.address() as { port: number }).port}`;
    assert.equal((await fetch(`${disabledUrl}/dictionary/status`)).status, 200);
    assert.equal((await fetch(`${disabledUrl}/dictionary/word`, { method: 'POST', body: JSON.stringify({ word: 'learn' }) })).status, 503);
    assert.equal((await fetch(`${pairedUrl}/dictionary/word`, { method: 'POST', body: JSON.stringify({ word: 'learn' }) })).status, 401);
    const response = await fetch(`${pairedUrl}/dictionary/word`, { method: 'POST', headers: { authorization: `Bearer ${'a'.repeat(32)}`, 'content-type': 'application/json' }, body: JSON.stringify({ word: 'learn' }) });
    const body = await response.json() as Record<string, unknown>;
    assert.equal(body.ipa, 'ˈlɜːrn');
    assert.equal(body.partOfSpeech, 'verb');
    assert.equal(body.source, 'merriam-webster-learners');
    assert.equal(typeof body.fetchedAt, 'number');
  } finally {
    await Promise.all([new Promise<void>((resolve, reject) => disabled.close((error) => error ? reject(error) : resolve())), new Promise<void>((resolve, reject) => paired.close((error) => error ? reject(error) : resolve()))]);
  }
});

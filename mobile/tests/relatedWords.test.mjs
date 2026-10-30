import assert from 'node:assert/strict';
import test from 'node:test';
import { AiRequestError, parseRelatedWords, requestRelatedWords } from '../localServer/ai.ts';

const candidate = { word: 'calm', category: 'synonym', definition: 'peaceful', chineseHint: '平静的', reason: '也可表示不慌张。', dictionaryStatus: 'found' };
const family = { ...candidate, word: 'serenely', category: 'word_family',
  wordFamily: { kind: 'derivation', base: 'serene', meaning: '平静的', affix: '-ly：构成副词' } };
const connection = { address: '192.168.1.20:3001', token: 'a'.repeat(32) };

test('mobile recommendation client calls paired local server and validates candidate metadata', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    assert.equal(url, 'http://192.168.1.20:3001/ai/related-words');
    assert.equal(init.headers.authorization, `Bearer ${connection.token}`);
    assert.deepEqual(JSON.parse(init.body), { word: 'serene', meaning: '宁静' });
    return { ok: true, json: async () => ({ candidates: [candidate] }) };
  };
  try { assert.deepEqual(await requestRelatedWords(connection, 'serene', '宁静'), [candidate]); }
  finally { globalThis.fetch = originalFetch; }
});

test('mobile preserves structured word-family explanations and accepts old servers without inventing roots', () => {
  for (const wordFamily of [
    family.wordFamily,
    { kind: 'shared_root', base: ' port ', meaning: ' 携带 ', affix: null },
    { kind: 'inflection', base: 'learn', meaning: '学习', affix: null },
    { kind: 'uncertain', base: null, meaning: null, affix: null },
  ]) {
    const parsed = parseRelatedWords({ candidates: [{ ...family, wordFamily }] }, 'serene')[0];
    assert.equal(parsed.wordFamily.kind, wordFamily.kind);
    assert.equal(parsed.wordFamily.base, wordFamily.base?.trim() ?? null);
    assert.equal(parsed.dictionaryStatus, 'found');
  }
  const { wordFamily, ...legacy } = family;
  assert.deepEqual(parseRelatedWords({ candidates: [legacy] }, 'serene'), [legacy]);
});

test('mobile rejects invalid word-family details even when dictionary found the word', () => {
  for (const wordFamily of [
    null, [], {}, { ...family.wordFamily, kind: 'verified_root' }, { ...family.wordFamily, kind: ['derivation'] },
    { ...family.wordFamily, base: '' }, { ...family.wordFamily, base: 'x'.repeat(81) },
    { ...family.wordFamily, meaning: '' }, { ...family.wordFamily, meaning: 'x'.repeat(201) },
    { ...family.wordFamily, affix: null }, { ...family.wordFamily, affix: 'x'.repeat(81) },
    { ...family.wordFamily, base: 'serene\n' }, { ...family.wordFamily, verified: true },
    { ...family.wordFamily, kind: 'uncertain' }, { ...family.wordFamily, kind: 'inflection' },
    { kind: 'shared_root', base: 'port', meaning: '携带' },
  ]) assert.throws(() => parseRelatedWords({ candidates: [{ ...family, wordFamily }] }, 'serene'), AiRequestError);
  assert.throws(() => parseRelatedWords({ candidates: [{ ...candidate, wordFamily: family.wordFamily }] }, 'serene'), AiRequestError);
});

test('mobile receives family details through the paired request without making extra AI requests', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; return { ok: true, json: async () => ({ candidates: [family] }) }; };
  try {
    assert.deepEqual(await requestRelatedWords(connection, 'serene'), [family]);
    assert.equal(calls, 1);
  } finally { globalThis.fetch = originalFetch; }
});

test('mobile rejects self, duplicates, excessive candidates and fabricated dictionary statuses', () => {
  assert.deepEqual(parseRelatedWords({ candidates: [] }, 'serene'), []);
  for (const candidates of [
    [{ ...candidate, word: 'SERENE' }],
    [candidate, { ...candidate, word: ' CALM ' }],
    [{ ...candidate, category: 'constructor' }],
    [{ ...candidate, dictionaryStatus: 'verified_relationship' }],
    [{ ...candidate, reason: '' }],
    [candidate, { ...candidate, word: 'quiet' }, { ...candidate, word: 'peaceful' }],
    Array(9).fill(candidate),
  ]) assert.throws(() => parseRelatedWords({ candidates }, 'serene'), AiRequestError);
});

test('recommendation pairing failure is actionable and raw server data never reaches the screen', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => ({ ok: false, status: 401, json: async () => ({ private: 'secret' }) });
    await assert.rejects(() => requestRelatedWords(connection, 'serene'), (error) => error.code === 'auth' && !error.message.includes('secret'));
    globalThis.fetch = async () => ({ ok: false, status: 502, json: async () => ({ error: 'invalid_response', private: 'secret' }) });
    await assert.rejects(() => requestRelatedWords(connection, 'serene'), (error) => error.code === 'invalid_response' && !error.message.includes('secret'));
  } finally { globalThis.fetch = originalFetch; }
});

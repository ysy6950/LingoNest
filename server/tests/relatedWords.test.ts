import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import { AiServiceError, createAiService, parseRelatedWords } from '../src/ai.js';
import { createApp } from '../src/app.js';
import { createDictionaryService, dictionaryContainsWord } from '../src/dictionary.js';

const candidate = { word: 'calm', category: 'synonym', definition: 'peaceful and not worried', chineseHint: '平静的', reason: '都可描述平静；calm 也可强调不慌张。' };
const family = { word: 'serenely', category: 'word_family', definition: 'in a calm way', chineseHint: '平静地', reason: 'serene 加 -ly 构成副词 serenely。',
  wordFamily: { kind: 'derivation', base: 'serene', meaning: '平静的', affix: '-ly：构成副词' } };
const aiConfig = { baseUrl: 'http://127.0.0.1:4567/v1', apiKey: 'test-only-key', model: 'test', timeoutMs: 100 };
function fakeAi(candidates: unknown = [candidate]) {
  return createAiService(aiConfig, 'configured', async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ candidates }) } }] })));
}

test('recommendation contract rejects duplicates, source, bad categories, excess and invented fields', () => {
  assert.deepEqual(parseRelatedWords({ candidates: [] }, 'serene'), []);
  assert.deepEqual(parseRelatedWords({ candidates: [candidate] }, 'serene'), [candidate]);
  for (const candidates of [
    [candidate, { ...candidate, word: ' Calm ' }],
    [{ ...candidate, word: 'SERENE' }],
    [{ ...candidate, category: 'random' }],
    [{ ...candidate, dictionaryStatus: 'found' }],
    [{ ...candidate, word: '' }],
    [{ ...candidate, definition: '' }],
    [{ ...candidate, reason: 'x'.repeat(301) }],
    [candidate, { ...candidate, word: 'peaceful' }, { ...candidate, word: 'quiet' }],
    Array.from({ length: 9 }, () => candidate),
  ]) assert.throws(() => parseRelatedWords({ candidates }, 'serene'), (error) => error instanceof AiServiceError && error.code === 'invalid_response');
});

test('recommendation prompt uses source sense and does not request automatic dictionary truth', async () => {
  const service = createAiService(aiConfig, 'configured', async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    assert.deepEqual(JSON.parse(body.messages[1].content), { word: 'serene', meaning: '平静 宁静' });
    assert.match(body.messages[0].content, /same sense|sense of the source/);
    assert.match(body.messages[0].content, /Do not claim dictionary verification/);
    for (const instruction of ['shared_root', 'derivation', 'inflection', 'uncertain', 'all be null', 'similar spelling alone is not evidence']) {
      assert.ok(body.messages[0].content.includes(instruction));
    }
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ candidates: [candidate] }) } }] }));
  });
  assert.deepEqual(await service.recommendWords({ word: 'serene', meaning: '平静\n宁静' }), [candidate]);
  await assert.rejects(() => service.recommendWords({ word: 'serene', meaning: 'x'.repeat(501) }), (error) => error instanceof AiServiceError && error.status === 400);
});

test('dictionary presence requires matching headword, entry id or stems; suggestions are not matches', () => {
  assert.equal(dictionaryContainsWord(['calm'], 'calm'), false);
  assert.equal(dictionaryContainsWord([{ meta: { id: 'quiet:1', stems: ['quiet'] } }], 'calm'), false);
  assert.equal(dictionaryContainsWord([{ meta: { id: 'calm:2' } }], 'CALM'), true);
  assert.equal(dictionaryContainsWord([{ hwi: { hw: 'peace*ful' } }], 'peaceful'), true);
  assert.equal(dictionaryContainsWord([{ meta: { stems: ['keep calm'] } }], ' keep   calm '), true);
});

test('related endpoint pairs first, validates input and treats dictionary failures as unverified', async () => {
  const token = 'a'.repeat(32);
  const candidates = [candidate, { ...candidate, word: 'agitated', category: 'antonym' },
    family];
  const dictionary = createDictionaryService({ baseUrl: 'http://127.0.0.1/dict', apiKey: 'not-a-real-key', timeoutMs: 100 }, 'configured', async (url) => {
    const word = new URL(url).pathname.split('/').at(-1);
    if (word === 'agitated') return new Response(JSON.stringify(['agitation']));
    if (word === 'serenely') return new Response('private provider error', { status: 401 });
    return new Response(JSON.stringify([{ meta: { id: 'calm:1' } }]));
  });
  const server = createApp(undefined, { backupToken: token, aiService: fakeAi(candidates), dictionaryService: dictionary }).listen(0, '127.0.0.1');
  try {
    await once(server, 'listening');
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/ai/related-words`;
    const post = (body: unknown, authorized = true) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...(authorized ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
    assert.equal((await post({ word: 'serene' }, false)).status, 401);
    assert.equal((await post({ word: 123 })).status, 400);
    const result = await post({ word: 'serene', meaning: '宁静' });
    assert.equal(result.status, 200);
    const body = await result.json();
    assert.deepEqual(body.candidates.map((item: { dictionaryStatus: string }) => item.dictionaryStatus), ['found', 'not_found', 'unavailable']);
    assert.deepEqual(body.candidates[2].wordFamily, family.wordFamily);
    assert.ok(!JSON.stringify(body).includes('private provider'));
    assert.ok(!JSON.stringify(body).includes(token));
  } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
});

test('word-family contract distinguishes roots, derivations, inflections and explicitly unknown structure', () => {
  for (const wordFamily of [
    { kind: 'shared_root', base: ' port ', meaning: ' 携带 ', affix: null },
    family.wordFamily,
    { kind: 'inflection', base: 'learn', meaning: '学习', affix: null },
    { kind: 'uncertain', base: null, meaning: null, affix: null },
  ]) {
    const parsed = parseRelatedWords({ candidates: [{ ...family, wordFamily }] }, 'serene');
    assert.equal(parsed[0].wordFamily?.kind, wordFamily.kind);
    assert.equal(parsed[0].wordFamily?.base, wordFamily.base?.trim() ?? null);
    assert.equal(parsed[0].wordFamily?.meaning, wordFamily.meaning?.trim() ?? null);
  }
});

test('word-family contract rejects missing, invented, inconsistent and oversized structure', () => {
  const { wordFamily, ...withoutFamily } = family;
  const invalidFamilies = [
    null, [], {}, { ...wordFamily, kind: 'verified_root' }, { ...wordFamily, kind: ['derivation'] },
    { ...wordFamily, base: '' }, { ...wordFamily, base: 'x'.repeat(81) },
    { ...wordFamily, meaning: ' ' }, { ...wordFamily, meaning: 'x'.repeat(201) },
    { ...wordFamily, affix: null }, { ...wordFamily, affix: 'x'.repeat(81) },
    { ...wordFamily, base: 'serene\n' }, { ...wordFamily, source: 'dictionary' },
    { ...wordFamily, kind: 'uncertain' }, { ...wordFamily, kind: 'inflection' },
    { kind: 'shared_root', base: 'port', meaning: '携带' },
  ];
  for (const item of [withoutFamily, { ...candidate, wordFamily }, ...invalidFamilies.map((value) => ({ ...family, wordFamily: value }))]) {
    assert.throws(() => parseRelatedWords({ candidates: [item] }, 'serene'), (error) => error instanceof AiServiceError && error.code === 'invalid_response');
  }
});

test('provider word-family analysis is preserved without fabricated verification', async () => {
  assert.deepEqual(await fakeAi([family]).recommendWords({ word: 'serene' }), [family]);
  await assert.rejects(() => fakeAi([{ ...family, wordFamily: { kind: 'uncertain', base: 'guessed', meaning: null, affix: null } }]).recommendWords({ word: 'serene' }),
    (error) => error instanceof AiServiceError && error.code === 'invalid_response');
});

test('recommendations work without dictionary; disabled AI, malformed responses and health-only stay explicit', async () => {
  for (const [options, status, expected] of [
    [{ aiService: fakeAi() }, 200, 'not_configured'],
    [{ aiService: createAiService(null) }, 503, 'ai_disabled'],
    [{ aiService: fakeAi([{ ...candidate, category: 'unknown' }]) }, 502, 'invalid_response'],
    [{ lanHealthOnly: true, aiService: fakeAi() }, 404, 'ai_unavailable_in_health_only_mode'],
  ] as const) {
    const server = createApp(undefined, options).listen(0, '127.0.0.1');
    try {
      await once(server, 'listening');
      const response = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/ai/related-words`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"word":"serene"}' });
      assert.equal(response.status, status);
      const body = await response.json();
      assert.equal(status === 200 ? body.candidates[0].dictionaryStatus : body.error, expected);
    } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
  }
});

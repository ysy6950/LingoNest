import assert from 'node:assert/strict';
import { test } from 'node:test';
import { requestWordPronunciation, DictionaryRequestError } from '../localServer/dictionary.ts';

const connection = { address: '192.168.1.20:3001', token: 'a'.repeat(32) };
const reply = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

async function withFetch(mock, action) {
  const previous = globalThis.fetch;
  globalThis.fetch = mock;
  try { await action(); } finally { globalThis.fetch = previous; }
}

test('mobile dictionary client sends only the word to the paired local server', async () => {
  let request;
  await withFetch(async (url, init) => {
    request = { url, init };
    return reply({ ipa: 'ˈlɜːrn', partOfSpeech: 'verb', audioUrl: 'https://media.merriam-webster.com/audio/prons/en/us/mp3/l/learn0001.mp3', audioAccent: 'us', source: 'merriam-webster-learners', fetchedAt: 100 });
  }, async () => {
    assert.deepEqual(await requestWordPronunciation(connection, 'learn'), { ipa: 'ˈlɜːrn', partOfSpeech: 'verb', audioUrl: 'https://media.merriam-webster.com/audio/prons/en/us/mp3/l/learn0001.mp3', audioAccent: 'us', source: 'merriam-webster-learners', fetchedAt: 100 });
  });
  assert.match(request.url, /\/dictionary\/word$/);
  assert.equal(JSON.parse(request.init.body).word, 'learn');
  assert.equal(JSON.stringify(request.init.body).includes(connection.token), false);
});

test('mobile repairs an older backend flat audio URL before it reaches the player', async () => {
  await withFetch(async () => reply({ ipa: 'x', audioUrl: 'https://media.merriam-webster.com/audio/prons/en/us/mp3/bix00001.mp3', audioAccent: 'us', source: 'merriam-webster-learners', fetchedAt: 100 }), async () => {
    assert.equal((await requestWordPronunciation(connection, 'word')).audioUrl, 'https://media.merriam-webster.com/audio/prons/en/us/mp3/bix/bix00001.mp3');
  });
});

test('mobile dictionary client rejects an untrusted audio URL', async () => {
  await withFetch(async () => reply({ ipa: 'ˈlɜːrn', audioUrl: 'https://evil.example/audio.mp3', audioAccent: 'us', source: 'merriam-webster-learners', fetchedAt: 100 }), async () => {
    await assert.rejects(requestWordPronunciation(connection, 'learn'), (error) => error instanceof DictionaryRequestError && error.code === 'invalid_response');
  });
});

test('mobile dictionary client rejects invalid response and safe errors', async () => {
  await withFetch(async () => reply({ ipa: 'x', source: 'merriam-webster-learners' }, 200), async () => {
    await assert.rejects(requestWordPronunciation(connection, 'learn'), (error) => error instanceof DictionaryRequestError && error.code === 'invalid_response');
  });
  await withFetch(async () => reply({ error: 'not_found' }, 404), async () => {
    await assert.rejects(requestWordPronunciation(connection, 'learn'), (error) => error instanceof DictionaryRequestError && error.code === 'not_found');
  });
  await withFetch(async () => reply({}, 404), async () => {
    await assert.rejects(requestWordPronunciation(connection, 'learn'), (error) => error instanceof DictionaryRequestError && error.code === 'mode');
  });
});

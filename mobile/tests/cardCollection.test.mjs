import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === './reviewScheduler' && context.parentURL?.includes('/cardCollection.ts')) {
      return nextResolve('./reviewScheduler.ts', context);
    }
    return nextResolve(specifier, context);
  },
});

const { searchAllCards } = await import('../cardCollection.ts');

test('global search finds words and meanings across groups without changing cards', () => {
  const cards = [
    { id: 1, word: 'Calm', meaning: '平静的', groupId: 1, createdAt: 10 },
    { id: 2, word: 'peace', meaning: '内心平静', groupId: 2, createdAt: 30 },
    { id: 3, word: 'apple', meaning: '苹果', groupId: 3, createdAt: 20 },
  ];
  const before = JSON.stringify(cards);
  assert.deepEqual(searchAllCards(cards, ' 平静 ').map((card) => card.id), [2, 1]);
  assert.deepEqual(searchAllCards(cards, 'CALM').map((card) => card.id), [1]);
  assert.deepEqual(searchAllCards(cards, '  '), []);
  assert.deepEqual(searchAllCards(cards, 'missing'), []);
  assert.equal(JSON.stringify(cards), before);
});

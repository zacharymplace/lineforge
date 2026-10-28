import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
registerHooks({ resolve(specifier, context, nextResolve) {
  try { return nextResolve(specifier, context); }
  catch (error) {
    if (error.code === 'ERR_MODULE_NOT_FOUND' && specifier.startsWith('.') && !specifier.endsWith('.ts')) return nextResolve(`${specifier}.ts`, context);
    throw error;
  }
} });
const { saveStudyData, saveStoredGame } = await import('../src/lib/move-ledger/storage.ts');
const game = { id: 'fixture', moves: [] };
const library = { savedGames: [game], activeGameId: game.id };
const cards = [{ id: 'fixture-card' }];
const original = JSON.stringify({ game, library, cards });
const values = new Map();
let failingKey = null;
let writes = [];
globalThis.window = { localStorage: { setItem(key, value) {
  writes.push(key);
  if (key === failingKey) throw new DOMException('Full', 'QuotaExceededError');
  values.set(key, value);
} } };
assert.deepEqual(saveStudyData(game, library, cards), { saved: true, failedKeys: [] });
assert.equal(values.size, 3);
const keys = [...values.keys()];
for (const key of keys) {
  failingKey = key;
  writes = [];
  assert.deepEqual(saveStudyData(game, library, cards), { saved: false, failedKeys: [key] });
  assert.equal(writes.length, 3, 'one failed record must not stop the other writes');
}
failingKey = null;
assert.equal(saveStudyData(game, library, cards).saved, true, 'retry recovers');
assert.deepEqual([...values.values()].map(JSON.parse), [game, library, cards]);
Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new DOMException('Denied', 'SecurityError'); } });
assert.equal(saveStudyData(game, library, cards).failedKeys.length, 3);
assert.equal(saveStoredGame(game).saved, false);
delete globalThis.window;
assert.equal(saveStudyData(game, library, cards).saved, false, 'SSR cannot claim persistence');
assert.equal(JSON.stringify({ game, library, cards }), original, 'failure preserves data for export');
console.log('Storage checks passed: persistence, each partial failure, denied access, retry, SSR, unchanged input.');

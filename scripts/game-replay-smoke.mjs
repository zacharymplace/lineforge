import assert from 'node:assert/strict';
import { createGameFromChess, importPgn, loadGameAtPly } from '../src/lib/move-ledger/game.ts';

const pgn = `[Event "Replay regression"]
[White "Ada"]
[Black "Grace"]
[Result "1-0"]

1. e4 {Keep this comment} e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7# 1-0`;
const game = importPgn(pgn);
for (let ply = 0; ply <= game.moves.length; ply++) {
  const replay = loadGameAtPly(game, ply);
  assert.equal(replay.getHeaders().White, 'Ada');
  assert.equal(replay.getHeaders().Result, '1-0');
  assert.equal(replay.history().length, ply);
  assert.equal(replay.fen(), ply ? game.moves[ply - 1].after : game.initialFen);
}
const edited = loadGameAtPly(game, game.moves.length);
edited.undo();
const saved = createGameFromChess(edited, game);
assert.equal(saved.id, game.id);
assert.match(saved.pgn, /\[Event "Replay regression"\]/);
assert.match(saved.pgn, /Keep this comment/);
assert.equal(loadGameAtPly(saved, saved.moves.length).fen(), saved.fen);

const initialFen = '4k3/8/8/8/8/8/4P3/4K3 b - - 0 12';
const custom = importPgn(`[SetUp "1"]\n[FEN "${initialFen}"]\n\n12... Kd7 13. e4 *`);
assert.equal(custom.initialFen, initialFen);
assert.equal(loadGameAtPly(custom, 0).fen(), initialFen);
assert.equal(loadGameAtPly(custom, custom.moves.length).fen(), custom.fen);
assert.equal(loadGameAtPly(custom, -1).history().length, 0);
assert.equal(loadGameAtPly(custom, 100).fen(), custom.fen);
console.log('PASS: replay metadata, comments, undo round trip, custom start, and ply bounds');

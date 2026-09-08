import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { Chess } from 'chess.js';

// Resolve the application's TypeScript and @ imports without copying its logic.
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) return nextResolve(new URL(`../src/${specifier.slice(2)}.ts`, import.meta.url).href, context);
  try { return nextResolve(specifier, context); }
  catch (error) {
    if (error.code === 'ERR_MODULE_NOT_FOUND' && specifier.startsWith('.') && !specifier.endsWith('.ts')) return nextResolve(`${specifier}.ts`, context);
    throw error;
  }
} });
const { importPgn } = await import('../src/lib/move-ledger/game.ts');
const { createMistakeCard } = await import('../src/lib/mistake-graph/cards.ts');
const { createCorrection } = await import('../src/lib/mistake-graph/correction.ts');
const { evaluateDrillMove, evaluateDrillSan, createDrillAttempt, appendDrillAttempt } = await import('../src/lib/drill-queue/review.ts');
const { createBackup, serializeBackup, parseBackupJson } = await import('../src/lib/move-ledger/backup.ts');
const { buildCardReviewPacket } = await import('../src/lib/review-packets/build.ts');
const { renderReviewPacketMarkdown } = await import('../src/lib/review-packets/export.ts');
const { buildReviewSession, recordReviewSessionResult, completeReviewSession } = await import('../src/lib/drill-queue/session.ts');
const game = importPgn('1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7# 1-0');
const input = { move: 'Qe7', reason: 'Defend f7 against the immediate queen capture.', source: 'Self-analysis of the demo position' };
const legacy = createMistakeCard(game, 6);
const card = createMistakeCard(game, 6, undefined, input);
assert.equal(card.moveSan, 'Nf6');
assert.equal(card.correction.moveSan, 'Qe7');
assert.equal(card.attempts, 0);
assert.equal(evaluateDrillMove(card, 'd8', 'e7').isMatch, true);
assert.equal(evaluateDrillMove(card, 'g8', 'f6').isMatch, false);
assert.equal(evaluateDrillMove(legacy, 'g8', 'f6').isMatch, true);
assert.equal(evaluateDrillSan(card, 'Qe7').isMatch, true);
assert.equal(evaluateDrillSan(card, 'not a move').isMatch, false);
assert.throws(() => createMistakeCard(game, 6, undefined, { ...input, move: 'Nf6' }), /alternative/);
assert.throws(() => createMistakeCard(game, 6, undefined, { ...input, move: 'Qe5' }), /not legal/);
assert.throws(() => createMistakeCard(game, 6, undefined, { ...input, reason: ' ' }), /reason/);
assert.throws(() => createMistakeCard(game, 6, undefined, { ...input, source: ' ' }), /source/);
const attempt = createDrillAttempt(card, 'missed', 'played', 'Nf6', game.moves[5].after);
assert.equal(attempt.expectedMoveSan, 'Qe7');
const reviewed = appendDrillAttempt(card, attempt);
assert.equal(reviewed.attempts, 1);
assert.equal(reviewed.correct, 0);
const backup = createBackup({ savedGames: [game], activeGameId: game.id }, [legacy, reviewed]);
const restored = parseBackupJson(serializeBackup(backup));
assert.deepEqual(restored.mistakeCards[1].correction, card.correction);
assert.equal(restored.mistakeCards[0].correction, undefined);
for (const field of ['fenAfter', 'moveSan', 'reason', 'source', 'savedAt']) {
  const broken = structuredClone(backup);
  broken.mistakeCards[1].correction[field] = '';
  assert.throws(() => parseBackupJson(serializeBackup(broken)), /backup/i);
}
const packet = buildCardReviewPacket({ card: reviewed });
assert.deepEqual(packet.correction, card.correction);
const markdown = renderReviewPacketMarkdown(packet);
assert.match(markdown, /Target: Qe7/);
assert.match(markdown, /Self-analysis/);
let session = buildReviewSession([card], { type: 'all' }, 5);
session = recordReviewSessionResult(session, card.id, 'missed', { attemptedMoveSan: 'Nf6', expectedMoveSan: 'Qe7' });
const summary = completeReviewSession(session, [reviewed]);
assert.match(JSON.stringify(summary), /Qe7/);
// An explicit underpromotion target can be entered and scored accurately.
const fenBefore = '7k/P7/8/8/8/8/8/7K w - - 0 1';
const queen = new Chess(fenBefore); const original = queen.move('a8=Q+');
const promotionCard = { ...legacy, fenBefore, fenAfter: queen.fen(), moveSan: original.san };
promotionCard.correction = createCorrection(promotionCard, { ...input, move: 'a8=N', reason: 'Underpromotion test fixture' });
assert.equal(evaluateDrillSan(promotionCard, 'a8=N').isMatch, true);
assert.equal(evaluateDrillSan(promotionCard, 'a8=Q+').isMatch, false);
console.log('PASS: correction creation, legacy recall, legal targets, incorrect answers, provenance, attempt history, backup validation, packets, sessions, and underpromotion');

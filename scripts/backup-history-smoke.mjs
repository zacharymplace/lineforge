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
const { createBackup, parseBackupJson, serializeBackup } = await import('../src/lib/move-ledger/backup.ts');
const { buildReviewSession, recordReviewSessionResult, completeReviewSession } = await import('../src/lib/drill-queue/session.ts');
const { saveStudyData } = await import('../src/lib/move-ledger/storage.ts');
const game = importPgn('1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7# 1-0');
const card = createMistakeCard(game,6);
const library = { savedGames:[game],activeGameId:game.id };
const session = buildReviewSession([card],{type:'all'},'all');
const summary = completeReviewSession(recordReviewSessionResult(session,card.id,'remembered',{attemptedMoveSan:'Nf6',expectedMoveSan:'Nf6'}),[card]);
const backup = createBackup(library,[card],[summary]);
assert.deepEqual(parseBackupJson(serializeBackup(backup)),JSON.parse(JSON.stringify(backup)));
const legacy = structuredClone(backup);delete legacy.sessionSummaries;
assert.equal(parseBackupJson(JSON.stringify(legacy)).sessionSummaries,undefined);
assert.deepEqual(parseBackupJson(JSON.stringify({...backup,sessionSummaries:[]})).sessionSummaries,[]);
for(const mutate of [s=>s.filter={type:'unknown'},s=>s.results[0].result='bad',s=>s.results[0].recordedAt='bad',s=>s.results[0].attemptedFenAfter='bad',s=>s.remembered=2,s=>s.successRate=50,s=>s.selectedCardIds=[7],s=>s.topMissedTags=[{tag:'bogus',count:1}],s=>s.verdictBreakdown=null,s=>s.results.push(s.results[0])]) {
 const bad=structuredClone(backup);mutate(bad.sessionSummaries[0]);assert.throws(()=>parseBackupJson(JSON.stringify(bad)),/valid LineForge backup/);
}
const oldSummary=structuredClone(backup);delete oldSummary.sessionSummaries[0].results;assert.doesNotThrow(()=>parseBackupJson(JSON.stringify(oldSummary)));
const values=new Map();let fail=false;
globalThis.window={localStorage:{setItem(k,v){if(fail && k.includes('sessionSummaries')) throw Error('quota');values.set(k,v);}}};
assert.equal(saveStudyData(game,library,[card],[summary]).saved,true);
assert.deepEqual(JSON.parse(values.get('lineforge.drillQueue.sessionSummaries.v1')),[summary]);
fail=true;assert.equal(saveStudyData(game,library,[card],[]).saved,false);
fail=false;assert.equal(saveStudyData(game,library,[card],[]).saved,true);
assert.deepEqual(JSON.parse(values.get('lineforge.drillQueue.sessionSummaries.v1')),[]);
console.log('Backup session history: round trip, legacy absence, explicit empty, malformed input and persistence retry passed.');
if (process.env.LINEFORGE_BACKUP_FIXTURE) {
  const fs = await import('node:fs/promises');
  await fs.writeFile(process.env.LINEFORGE_BACKUP_FIXTURE,serializeBackup(backup));
}

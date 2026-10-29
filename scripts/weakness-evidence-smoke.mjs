import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

// Resolve the application's TypeScript and @ imports without copying its logic.
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) return nextResolve(new URL(`../src/${specifier.slice(2)}.ts`, import.meta.url).href, context);
  try { return nextResolve(specifier, context); }
  catch (error) {
    if (error.code === 'ERR_MODULE_NOT_FOUND' && specifier.startsWith('.') && !specifier.endsWith('.ts')) return nextResolve(`${specifier}.ts`, context);
    throw error;
  }
} });


const { buildOpeningWeaknessMap, buildFilteredOpeningWeaknessMap } = await import('../src/lib/mistake-graph/opening-weakness-map.ts');
const { buildOpeningWeaknessTrend } = await import('../src/lib/mistake-graph/opening-weakness-trends.ts');
const make=(id,verdict,results)=>({id,sourceGameId:'synthetic',ply:6,moveSan:'Nf6',verdict,tags:[],attempts:results.length,correct:results.filter(r=>r==='remembered').length,attemptHistory:results.map((result,i)=>({id:`${id}-${i}`,result,attemptedAt:'2026-10-28T12:00:00Z'}))});
const cards=[make('recall','blunder',['remembered','remembered']),make('correction','blunder',['remembered','remembered']),make('mate','good',['remembered','remembered'])];
const before=JSON.stringify(cards);
const map=buildOpeningWeaknessMap([],cards);
assert.equal(map.summary.strongestBucket.label,'Blunder');assert.equal(map.summary.strongestBucket.count,2);
assert.equal(map.summary.mostMissedBucket,undefined);assert.match(map.summary.reviewEvidence,/No missed reviews recorded across 6 attempts/);
assert.equal(buildOpeningWeaknessTrend(map,cards,[]).summary.mostMissedBucket,undefined);
assert.match(buildOpeningWeaknessTrend(map,cards,[]).summary.recommendedNextFocus,/No missed reviews recorded/);
const unreviewed=[make('new','blunder',[])];const fresh=buildOpeningWeaknessMap([],unreviewed);
assert.match(fresh.summary.reviewEvidence,/No review attempts yet/);assert.equal(fresh.summary.mostMissedBucket,undefined);
assert.match(buildOpeningWeaknessTrend(fresh,unreviewed,[]).summary.recommendedNextFocus,/No scored review attempts yet/);
const mixed=[make('frequent','blunder',['remembered','remembered']),make('missed','unclear',['missed'])];
const mixedMap=buildOpeningWeaknessMap([],mixed);
assert.equal(mixedMap.summary.mostMissedBucket.label,'Unclear');assert.equal(buildOpeningWeaknessTrend(mixedMap,mixed,[]).summary.mostMissedBucket.bucketLabel,'Unclear');
assert.match(mixedMap.summary.reviewEvidence,/1 missed reviews across 3 attempts/);
const filtered=buildFilteredOpeningWeaknessMap(mixedMap,{reviewState:'remembered-only'});assert.equal(filtered.summary.mostMissedBucket,undefined);assert.match(filtered.summary.reviewEvidence,/No missed reviews recorded/);
const empty=buildOpeningWeaknessMap([],[]);assert.equal(empty.summary.strongestBucket,undefined);assert.equal(empty.summary.mostMissedBucket,undefined);
const skipped=buildOpeningWeaknessTrend(fresh,unreviewed,[{results:[{cardId:'new',result:'skipped',recordedAt:'2026-10-28T12:00:00Z'}]}]);assert.equal(skipped.summary.mostMissedBucket,undefined);assert.match(skipped.summary.recommendedNextFocus,/No scored review attempts yet/);
assert.equal(JSON.stringify(cards),before);
console.log('PASS weakness evidence: all-success, no attempts, empty, real misses, filtered results, skip-only, unchanged inputs.');

const successThenSkip=buildOpeningWeaknessTrend(map,cards,[{results:[{cardId:'recall',result:'skipped',recordedAt:'2026-10-29T12:00:00Z'}]}]);
assert.equal(successThenSkip.summary.worseningBucket,undefined);
assert.equal(successThenSkip.summary.improvingBucket,undefined);
assert.equal(successThenSkip.buckets[0].recentSuccessRate,100);
assert.match(successThenSkip.summary.recommendedNextFocus,/No missed reviews recorded/);
console.log('PASS skipped-only days do not manufacture a worsening trend.');

const noMisses=buildFilteredOpeningWeaknessMap(map,{reviewState:'missed-only'});
assert.equal(noMisses.signals.length,0);
assert.match(noMisses.summary.reviewEvidence,/No opening cards with missed reviews match/);
assert.match(noMisses.summary.reviewEvidence,/Across all opening cards: No missed reviews recorded across 6 attempts/);
assert(!noMisses.summary.reviewEvidence.includes('No review attempts yet'));
assert.match(noMisses.summary.recommendedNextReviewFocus,/reset filters/);
const notAttempted=buildFilteredOpeningWeaknessMap(fresh,{reviewState:'missed-only'});
assert.match(notAttempted.summary.reviewEvidence,/Across all opening cards: No review attempts yet/);
const hiddenMiss=buildFilteredOpeningWeaknessMap(mixedMap,{reviewState:'missed-only',verdict:'blunder'});
assert.match(hiddenMiss.summary.reviewEvidence,/No opening cards with missed reviews match/);
assert.match(hiddenMiss.summary.reviewEvidence,/Across all opening cards: 1 missed reviews across 3 attempts/);
const noCards=buildFilteredOpeningWeaknessMap(empty,{reviewState:'missed-only'});
assert.match(noCards.summary.reviewEvidence,/No opening cards saved yet/);
assert.equal(JSON.stringify(cards),before);
console.log('PASS empty filters distinguish no matching misses, no attempts, hidden misses, and no saved cards.');

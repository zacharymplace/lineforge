import type {
  LineForgeGame,
  MistakeCard,
  MistakeTag,
  MoveVerdict,
} from "@/lib/move-ledger/types";

export const OPENING_PHASE_MAX_PLY = 20;

export const OPENING_WEAKNESS_BUCKET_IDS = [
  "opening-confusion",
  "plan-mismatch",
  "missed-tactic",
  "bad-trade",
  "king-safety",
  "blunder",
  "unclear",
] as const;

export type OpeningWeaknessBucketId = (typeof OPENING_WEAKNESS_BUCKET_IDS)[number];

export type OpeningWeaknessSignal = {
  cardId: string;
  sourceGameId: string;
  sourceGameName?: string;
  ply: number;
  moveSan: string;
  verdict: MoveVerdict;
  tags: MistakeTag[];
  attempts: number;
  correct: number;
  missed: number;
  lastAttemptResult?: "remembered" | "missed";
  hasEngineAnalysis: boolean;
};

export type OpeningWeaknessBucket = {
  id: OpeningWeaknessBucketId;
  label: string;
  count: number;
  cardIds: string[];
  topTags: Array<{ tag: MistakeTag; count: number }>;
  remembered: number;
  missed: number;
  successRate: number;
  representativeMoves: string[];
  signals: OpeningWeaknessSignal[];
  recommendedNextAction: string;
};

export type OpeningWeaknessSummary = {
  totalOpeningCards: number;
  strongestBucket?: OpeningWeaknessBucket;
  mostMissedBucket?: OpeningWeaknessBucket;
  topRecurringTags: Array<{ tag: MistakeTag; count: number }>;
  recommendedNextReviewFocus: string;
};

export type OpeningWeaknessMap = {
  generatedAt: string;
  openingPhaseMaxPly: number;
  signals: OpeningWeaknessSignal[];
  buckets: OpeningWeaknessBucket[];
  summary: OpeningWeaknessSummary;
};

export type OpeningWeaknessFilter = {
  reviewState: "all" | "missed-only" | "remembered-only";
  activeGameId?: string | null;
  currentGameOnly?: boolean;
  verdict?: MoveVerdict | "all";
  tag?: MistakeTag | "all";
};

export type OpeningWeaknessFilterSummary = {
  visibleOpeningCards: number;
  hiddenOpeningCards: number;
  activeFilterLabels: string[];
  topVisibleBucket?: OpeningWeaknessBucket;
};

const BUCKET_LABELS: Record<OpeningWeaknessBucketId, string> = {
  "opening-confusion": "Opening confusion",
  "plan-mismatch": "Plan mismatch",
  "missed-tactic": "Missed tactic",
  "bad-trade": "Bad trade",
  "king-safety": "King safety",
  blunder: "Blunder",
  unclear: "Unclear",
};

export function buildOpeningWeaknessMap(
  savedGames: LineForgeGame[],
  cards: MistakeCard[],
  openingPhaseMaxPly = OPENING_PHASE_MAX_PLY,
): OpeningWeaknessMap {
  const sourceGameNames = new Map(savedGames.map((game) => [game.id, game.name]));
  const openingCards = cards.filter((card) => isOpeningPhaseCard(card, openingPhaseMaxPly));
  const signals = openingCards.map((card) => createOpeningWeaknessSignal(card, sourceGameNames));

  return buildOpeningWeaknessMapFromSignals(signals, openingPhaseMaxPly);
}

export function isOpeningPhaseCard(card: Pick<MistakeCard, "ply">, maxPly = OPENING_PHASE_MAX_PLY) {
  return card.ply <= maxPly;
}

export function buildOpeningWeaknessReviewCardIds(bucket: OpeningWeaknessBucket) {
  return [...new Set(bucket.cardIds)];
}

export function buildOpeningWeaknessReviewCardIdsFromSignals(signals: OpeningWeaknessSignal[]) {
  return [...new Set(signals.map((signal) => signal.cardId))];
}

export function filterOpeningWeaknessSignals(
  signals: OpeningWeaknessSignal[],
  filter: OpeningWeaknessFilter,
) {
  return signals.filter((signal) => {
    if (filter.reviewState === "missed-only" && signal.missed === 0) {
      return false;
    }

    if (filter.reviewState === "remembered-only" && (signal.correct === 0 || signal.missed > 0)) {
      return false;
    }

    if (filter.currentGameOnly && filter.activeGameId && signal.sourceGameId !== filter.activeGameId) {
      return false;
    }

    if (filter.currentGameOnly && !filter.activeGameId) {
      return false;
    }

    if (filter.verdict && filter.verdict !== "all" && signal.verdict !== filter.verdict) {
      return false;
    }

    if (filter.tag && filter.tag !== "all" && !signal.tags.includes(filter.tag)) {
      return false;
    }

    return true;
  });
}

export function buildFilteredOpeningWeaknessMap(
  openingMap: OpeningWeaknessMap,
  filter: OpeningWeaknessFilter,
): OpeningWeaknessMap {
  return buildOpeningWeaknessMapFromSignals(
    filterOpeningWeaknessSignals(openingMap.signals, filter),
    openingMap.openingPhaseMaxPly,
  );
}

export function summarizeOpeningWeaknessFilter(
  baseMap: OpeningWeaknessMap,
  filteredMap: OpeningWeaknessMap,
  filter: OpeningWeaknessFilter,
): OpeningWeaknessFilterSummary {
  return {
    visibleOpeningCards: filteredMap.summary.totalOpeningCards,
    hiddenOpeningCards: Math.max(
      0,
      baseMap.summary.totalOpeningCards - filteredMap.summary.totalOpeningCards,
    ),
    activeFilterLabels: getFilterLabels(filter),
    topVisibleBucket: filteredMap.summary.strongestBucket,
  };
}

function buildOpeningWeaknessMapFromSignals(
  signals: OpeningWeaknessSignal[],
  openingPhaseMaxPly: number,
): OpeningWeaknessMap {
  const buckets = OPENING_WEAKNESS_BUCKET_IDS.map((bucketId) =>
    buildOpeningWeaknessBucket(bucketId, signals.filter((signal) => signalMatchesBucket(signal, bucketId))),
  );
  const activeBuckets = buckets.filter((bucket) => bucket.count > 0);

  return {
    generatedAt: new Date().toISOString(),
    openingPhaseMaxPly,
    signals,
    buckets: activeBuckets,
    summary: buildOpeningWeaknessSummary(signals.length, activeBuckets),
  };
}

function createOpeningWeaknessSignal(
  card: MistakeCard,
  sourceGameNames: Map<string, string>,
): OpeningWeaknessSignal {
  const lastAttempt = card.attemptHistory.at(-1);

  return {
    cardId: card.id,
    sourceGameId: card.sourceGameId,
    sourceGameName: sourceGameNames.get(card.sourceGameId),
    ply: card.ply,
    moveSan: card.moveSan,
    verdict: card.verdict,
    tags: card.tags,
    attempts: card.attempts,
    correct: card.correct,
    missed: Math.max(0, card.attempts - card.correct),
    lastAttemptResult: lastAttempt?.result,
    hasEngineAnalysis: Boolean(card.engineAnalysis),
  };
}

function buildOpeningWeaknessBucket(
  bucketId: OpeningWeaknessBucketId,
  signals: OpeningWeaknessSignal[],
): OpeningWeaknessBucket {
  const remembered = signals.reduce((total, signal) => total + signal.correct, 0);
  const missed = signals.reduce((total, signal) => total + signal.missed, 0);

  return {
    id: bucketId,
    label: BUCKET_LABELS[bucketId],
    count: signals.length,
    cardIds: signals.map((signal) => signal.cardId),
    topTags: getTopTags(signals),
    remembered,
    missed,
    successRate: remembered + missed > 0 ? Math.round((remembered / (remembered + missed)) * 100) : 0,
    representativeMoves: getRepresentativeMoves(signals),
    signals,
    recommendedNextAction: getBucketRecommendation(bucketId, missed),
  };
}

function buildOpeningWeaknessSummary(
  totalOpeningCards: number,
  buckets: OpeningWeaknessBucket[],
): OpeningWeaknessSummary {
  const strongestBucket = [...buckets].sort((a, b) => b.count - a.count || b.missed - a.missed)[0];
  const mostMissedBucket = [...buckets].sort((a, b) => b.missed - a.missed || b.count - a.count)[0];
  const topRecurringTags = getTopTags(buckets.flatMap((bucket) => bucket.signals));

  return {
    totalOpeningCards,
    strongestBucket,
    mostMissedBucket,
    topRecurringTags,
    recommendedNextReviewFocus: getSummaryRecommendation(strongestBucket, mostMissedBucket),
  };
}

function signalMatchesBucket(signal: OpeningWeaknessSignal, bucketId: OpeningWeaknessBucketId) {
  if (bucketId === "opening-confusion") return signal.tags.includes("opening confusion");
  if (bucketId === "plan-mismatch") return signal.tags.includes("plan mismatch");
  if (bucketId === "missed-tactic") return signal.tags.includes("missed tactic");
  if (bucketId === "bad-trade") return signal.tags.includes("bad trade");
  if (bucketId === "king-safety") return signal.tags.includes("king safety");
  if (bucketId === "blunder") return signal.verdict === "blunder";
  return signal.verdict === "unclear";
}

function getTopTags(signals: OpeningWeaknessSignal[]) {
  const tagCounts = new Map<MistakeTag, number>();

  for (const signal of signals) {
    for (const tag of signal.tags) {
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }
  }

  return [...tagCounts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
    .slice(0, 5);
}

function getRepresentativeMoves(signals: OpeningWeaknessSignal[]) {
  return [...new Set(signals.map((signal) => signal.moveSan))].slice(0, 4);
}

function getBucketRecommendation(bucketId: OpeningWeaknessBucketId, missed: number) {
  if (missed > 0) {
    return "Start with missed cards in this bucket, then replay the same early position once more.";
  }

  if (bucketId === "opening-confusion") return "Review the first plan you wanted from the opening, not a long line.";
  if (bucketId === "plan-mismatch") return "Compare your intended plan with the move you actually chose.";
  if (bucketId === "missed-tactic") return "Before moving, list forcing candidate moves in the opening position.";
  if (bucketId === "bad-trade") return "Pause before early trades and compare material, activity, and structure.";
  if (bucketId === "king-safety") return "Check early king exposure, checks, and direct threats before developing.";
  if (bucketId === "blunder") return "Run a basic one-move safety check before committing to the opening move.";
  return "Add a short note to clarify what made these opening positions uncertain.";
}

function getSummaryRecommendation(
  strongestBucket: OpeningWeaknessBucket | undefined,
  mostMissedBucket: OpeningWeaknessBucket | undefined,
) {
  if (mostMissedBucket && mostMissedBucket.missed > 0) {
    return `Focus next on ${mostMissedBucket.label.toLowerCase()} cards with misses.`;
  }

  if (strongestBucket) {
    return `Review ${strongestBucket.label.toLowerCase()} cards as your current opening pattern.`;
  }

  return "Create early-game mistake cards to reveal opening patterns.";
}

function getFilterLabels(filter: OpeningWeaknessFilter) {
  const labels: string[] = [];

  if (filter.reviewState === "missed-only") labels.push("Missed only");
  if (filter.reviewState === "remembered-only") labels.push("Remembered only");
  if (filter.currentGameOnly) labels.push("Current saved game");
  if (filter.verdict && filter.verdict !== "all") labels.push(`Verdict: ${filter.verdict}`);
  if (filter.tag && filter.tag !== "all") labels.push(`Tag: ${filter.tag}`);

  return labels.length ? labels : ["All opening cards"];
}

import type { MistakeCard, MistakeTag, MoveVerdict, ReviewResult } from "@/lib/move-ledger/types";

const SESSION_SUMMARIES_KEY = "lineforge.drillQueue.sessionSummaries.v1";
const DEFAULT_SESSION_SIZE = 10;

export type ReviewSessionFilter =
  | { type: "all" }
  | { type: "verdict"; verdict: MoveVerdict }
  | { type: "tag"; tag: MistakeTag }
  | { type: "missed-recently" }
  | { type: "lowest-success-rate" }
  | { type: "most-recent" };

export type ReviewSessionCard = {
  cardId: string;
  position: number;
};

export type ReviewSessionResult = {
  cardId: string;
  result: ReviewResult | "skipped";
  recordedAt: string;
};

export type ReviewSession = {
  id: string;
  startedAt: string;
  completedAt?: string;
  filter: ReviewSessionFilter;
  selectedCardIds: string[];
  cards: ReviewSessionCard[];
  currentCardIndex: number;
  results: Record<string, ReviewSessionResult>;
  rememberedCount: number;
  missedCount: number;
  skippedCount: number;
};

export type ReviewSessionSummary = {
  id: string;
  startedAt: string;
  completedAt: string;
  filter: ReviewSessionFilter;
  selectedCardIds: string[];
  totalReviewed: number;
  remembered: number;
  missed: number;
  skipped: number;
  successRate: number;
  topMissedTags: Array<{ tag: MistakeTag; count: number }>;
  verdictBreakdown: Array<{ verdict: MoveVerdict; count: number }>;
  recommendedNextAction: string;
};

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function buildReviewSession(
  cards: MistakeCard[],
  filter: ReviewSessionFilter,
  limit = DEFAULT_SESSION_SIZE,
): ReviewSession | null {
  const selectedCards = filterSessionCards(cards, filter).slice(0, limit);

  if (selectedCards.length === 0) {
    return null;
  }

  return {
    id: `session-${Date.now()}-${createId()}`,
    startedAt: new Date().toISOString(),
    filter,
    selectedCardIds: selectedCards.map((card) => card.id),
    cards: selectedCards.map((card, index) => ({ cardId: card.id, position: index })),
    currentCardIndex: 0,
    results: {},
    rememberedCount: 0,
    missedCount: 0,
    skippedCount: 0,
  };
}

export function filterSessionCards(cards: MistakeCard[], filter: ReviewSessionFilter) {
  if (filter.type === "verdict") {
    return cards.filter((card) => card.verdict === filter.verdict);
  }

  if (filter.type === "tag") {
    return cards.filter((card) => card.tags.includes(filter.tag));
  }

  if (filter.type === "missed-recently") {
    return [...cards]
      .filter((card) => card.attemptHistory.at(-1)?.result === "missed")
      .sort((a, b) => dateValue(b.lastReviewedAt) - dateValue(a.lastReviewedAt));
  }

  if (filter.type === "lowest-success-rate") {
    return [...cards].sort((a, b) => {
      const successDelta = getCardSuccessRate(a) - getCardSuccessRate(b);
      return successDelta || b.attempts - a.attempts || dateValue(b.createdAt) - dateValue(a.createdAt);
    });
  }

  if (filter.type === "most-recent") {
    return [...cards].sort((a, b) => dateValue(b.createdAt) - dateValue(a.createdAt));
  }

  return cards;
}

export function recordReviewSessionResult(
  session: ReviewSession,
  cardId: string,
  result: ReviewSessionResult["result"],
): ReviewSession {
  if (session.completedAt || !session.selectedCardIds.includes(cardId)) {
    return session;
  }

  const nextResults = {
    ...session.results,
    [cardId]: {
      cardId,
      result,
      recordedAt: new Date().toISOString(),
    },
  };
  const currentIndex = session.cards.findIndex((card) => card.cardId === cardId);
  const nextIndex = Math.min(
    session.cards.length,
    Math.max(session.currentCardIndex, currentIndex + 1),
  );

  return {
    ...session,
    results: nextResults,
    currentCardIndex: nextIndex,
    rememberedCount: countResults(nextResults, "remembered"),
    missedCount: countResults(nextResults, "missed"),
    skippedCount: countResults(nextResults, "skipped"),
  };
}

export function completeReviewSession(
  session: ReviewSession,
  cards: MistakeCard[],
): ReviewSessionSummary {
  const completedAt = new Date().toISOString();
  const sessionCards = session.selectedCardIds
    .map((cardId) => cards.find((card) => card.id === cardId))
    .filter((card): card is MistakeCard => Boolean(card));
  const results = Object.values(session.results);
  const remembered = results.filter((result) => result.result === "remembered").length;
  const missed = results.filter((result) => result.result === "missed").length;
  const skipped = results.filter((result) => result.result === "skipped").length;
  const totalReviewed = remembered + missed + skipped;

  return {
    id: session.id,
    startedAt: session.startedAt,
    completedAt,
    filter: session.filter,
    selectedCardIds: session.selectedCardIds,
    totalReviewed,
    remembered,
    missed,
    skipped,
    successRate: remembered + missed > 0 ? Math.round((remembered / (remembered + missed)) * 100) : 0,
    topMissedTags: getTopMissedTags(session, sessionCards),
    verdictBreakdown: getVerdictBreakdown(sessionCards),
    recommendedNextAction: getRecommendedNextAction(session, sessionCards),
  };
}

export function saveReviewSessionSummary(
  summary: ReviewSessionSummary,
  storage?: StorageLike | null,
) {
  const currentSummaries = loadReviewSessionSummaries(storage);
  const nextSummaries = [summary, ...currentSummaries.filter((item) => item.id !== summary.id)].slice(0, 20);
  getStorage(storage)?.setItem(SESSION_SUMMARIES_KEY, JSON.stringify(nextSummaries));
  return nextSummaries;
}

export function loadReviewSessionSummaries(storage?: StorageLike | null): ReviewSessionSummary[] {
  try {
    const stored = getStorage(storage)?.getItem(SESSION_SUMMARIES_KEY);
    const parsed = stored ? JSON.parse(stored) : [];
    return Array.isArray(parsed) ? parsed.filter(isReviewSessionSummary) : [];
  } catch {
    return [];
  }
}

export function clearReviewSessionSummaries(storage?: StorageLike | null) {
  getStorage(storage)?.removeItem(SESSION_SUMMARIES_KEY);
}

export function getSessionDashboardStats(summaries: ReviewSessionSummary[]) {
  const latestSummary = summaries[0];

  return {
    totalSessionsCompleted: summaries.length,
    latestSuccessRate: latestSummary?.successRate ?? 0,
    recentSessions: summaries.slice(0, 3),
  };
}

function getTopMissedTags(session: ReviewSession, cards: MistakeCard[]) {
  const tagCounts = new Map<MistakeTag, number>();

  for (const result of Object.values(session.results)) {
    if (result.result !== "missed") {
      continue;
    }

    const card = cards.find((currentCard) => currentCard.id === result.cardId);
    for (const tag of card?.tags ?? []) {
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }
  }

  return [...tagCounts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
}

function getVerdictBreakdown(cards: MistakeCard[]) {
  const counts = new Map<MoveVerdict, number>();

  for (const card of cards) {
    counts.set(card.verdict, (counts.get(card.verdict) ?? 0) + 1);
  }

  return [...counts.entries()].map(([verdict, count]) => ({ verdict, count }));
}

function getRecommendedNextAction(session: ReviewSession, cards: MistakeCard[]) {
  const topMissedTag = getTopMissedTags(session, cards)[0]?.tag;
  const attempted = session.rememberedCount + session.missedCount;
  const missRate = attempted > 0 ? session.missedCount / attempted : 0;

  if (topMissedTag === "missed tactic") return "Repeat missed tactic cards.";
  if (topMissedTag === "king safety") return "Review king safety cards before your next game.";
  if (missRate >= 0.5) return "Reduce session size if miss rate stays high.";
  if (session.skippedCount > session.rememberedCount + session.missedCount) return "Run a smaller session and avoid skipping the first pass.";
  return "Keep this card mix in rotation.";
}

function isReviewSessionSummary(value: unknown): value is ReviewSessionSummary {
  if (!value || typeof value !== "object") {
    return false;
  }

  const summary = value as Partial<ReviewSessionSummary>;
  return (
    typeof summary.id === "string" &&
    typeof summary.startedAt === "string" &&
    typeof summary.completedAt === "string" &&
    Array.isArray(summary.selectedCardIds) &&
    typeof summary.totalReviewed === "number" &&
    typeof summary.remembered === "number" &&
    typeof summary.missed === "number" &&
    typeof summary.skipped === "number" &&
    typeof summary.successRate === "number" &&
    typeof summary.recommendedNextAction === "string"
  );
}

function countResults(
  results: Record<string, ReviewSessionResult>,
  result: ReviewSessionResult["result"],
) {
  return Object.values(results).filter((sessionResult) => sessionResult.result === result).length;
}

function getCardSuccessRate(card: MistakeCard) {
  return card.attempts > 0 ? card.correct / card.attempts : 0;
}

function dateValue(value?: string) {
  return value ? new Date(value).getTime() || 0 : 0;
}

function getStorage(storage?: StorageLike | null) {
  return storage ?? (typeof window !== "undefined" ? window.localStorage : null);
}

function createId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

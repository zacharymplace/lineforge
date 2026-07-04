import type { ReviewSessionSummary } from "@/lib/drill-queue/session";
import type {
  MistakeCard,
  MistakeTag,
  MoveVerdict,
  ReviewResult,
} from "@/lib/move-ledger/types";
import type { OpeningWeaknessMap } from "@/lib/mistake-graph/opening-weakness-map";

export type ReviewScheduleStatus = "due-now" | "due-soon" | "stable" | "new";

export type ReviewScheduleRule = {
  id:
    | "never-reviewed"
    | "missed-last"
    | "low-success-rate"
    | "remembered-recently"
    | "important-verdict"
    | "important-tag"
    | "recently-skipped";
  label: string;
  score: number;
};

export type ReviewScheduleItem = {
  cardId: string;
  moveSan: string;
  ply: number;
  verdict: MoveVerdict;
  tags: MistakeTag[];
  status: ReviewScheduleStatus;
  priorityScore: number;
  attempts: number;
  correct: number;
  successRate: number;
  lastReviewedAt?: string;
  lastAttemptResult?: ReviewResult;
  skippedRecently: boolean;
  openingBucketIds: string[];
  reasons: ReviewScheduleRule[];
};

export type ReviewScheduleSummary = {
  generatedAt: string;
  items: ReviewScheduleItem[];
  dueNowCount: number;
  dueSoonCount: number;
  stableCount: number;
  newCount: number;
  topPriorityItems: ReviewScheduleItem[];
  dueReviewCardIds: string[];
  recommendedNextAction: string;
};

const IMPORTANT_TAGS: MistakeTag[] = ["missed tactic", "king safety", "hung piece"];
const RECENT_REMEMBERED_STABLE_DAYS = 3;
const RECENT_SKIP_DAYS = 14;

export function buildReviewSchedule(
  cards: MistakeCard[],
  sessionSummaries: ReviewSessionSummary[] = [],
  openingMap?: OpeningWeaknessMap,
  now = new Date(),
): ReviewScheduleSummary {
  const openingBucketIdsByCard = getOpeningBucketIdsByCard(openingMap);
  const items = cards
    .map((card) =>
      buildReviewScheduleItem(
        card,
        wasSkippedRecently(card.id, sessionSummaries, now),
        openingBucketIdsByCard.get(card.id) ?? [],
        now,
      ),
    )
    .sort((a, b) => b.priorityScore - a.priorityScore || b.ply - a.ply);
  const dueNowItems = items.filter((item) => item.status === "due-now");
  const dueSoonItems = items.filter((item) => item.status === "due-soon");
  const newItems = items.filter((item) => item.status === "new");
  const stableItems = items.filter((item) => item.status === "stable");
  const dueReviewItems = dueNowItems.length ? dueNowItems : dueSoonItems.length ? dueSoonItems : newItems;

  return {
    generatedAt: now.toISOString(),
    items,
    dueNowCount: dueNowItems.length,
    dueSoonCount: dueSoonItems.length,
    stableCount: stableItems.length,
    newCount: newItems.length,
    topPriorityItems: items.slice(0, 5),
    dueReviewCardIds: dueReviewItems.map((item) => item.cardId),
    recommendedNextAction: getScheduleRecommendation(dueNowItems, dueSoonItems, newItems, items),
  };
}

export function buildDueReviewCardIds(summary: ReviewScheduleSummary) {
  return [...new Set(summary.dueReviewCardIds)];
}

export function getReviewScheduleStatusLabel(status: ReviewScheduleStatus) {
  if (status === "due-now") return "Due now";
  if (status === "due-soon") return "Due soon";
  if (status === "new") return "New";
  return "Stable";
}

export function getReviewScheduleBadgeText(item: ReviewScheduleItem) {
  return getReviewScheduleStatusLabel(item.status);
}

export function getReviewSchedulePriorityLabel(item: Pick<ReviewScheduleItem, "priorityScore">) {
  if (item.priorityScore >= 80) return "High priority";
  if (item.priorityScore >= 45) return "Medium priority";
  if (item.priorityScore > 0) return "Low priority";
  return "Low priority";
}

export function getReviewScheduleCardAction(item: ReviewScheduleItem) {
  if (item.lastAttemptResult === "missed") return "Review after missed attempt";
  if (item.skippedRecently) return "Review after skipped session";
  if (item.attempts === 0) return "Start first review";
  if (item.status === "due-soon") return "Review soon";
  if (item.status === "due-now") return "Review now";
  return "Keep in rotation";
}

export function formatReviewScheduleLastReviewed(item: Pick<ReviewScheduleItem, "lastReviewedAt">) {
  if (!item.lastReviewedAt) {
    return "Never reviewed";
  }

  const date = new Date(item.lastReviewedAt);
  return Number.isNaN(date.getTime()) ? "Last reviewed unknown" : `Last ${date.toLocaleDateString()}`;
}

function buildReviewScheduleItem(
  card: MistakeCard,
  skippedRecently: boolean,
  openingBucketIds: string[],
  now: Date,
): ReviewScheduleItem {
  const lastAttempt = card.attemptHistory.at(-1);
  const successRate = card.attempts > 0 ? Math.round((card.correct / card.attempts) * 100) : 0;
  const reasons: ReviewScheduleRule[] = [];

  if (card.attempts === 0) {
    reasons.push({
      id: "never-reviewed",
      label: "Never reviewed",
      score: 45,
    });
  }

  if (lastAttempt?.result === "missed") {
    reasons.push({
      id: "missed-last",
      label: "Missed last attempt",
      score: 70,
    });
  }

  if (card.attempts >= 2 && successRate < 50) {
    reasons.push({
      id: "low-success-rate",
      label: `Low success rate (${successRate}%)`,
      score: 30,
    });
  }

  if (isRememberedRecently(lastAttempt?.result, card.lastReviewedAt, now)) {
    reasons.push({
      id: "remembered-recently",
      label: "Remembered recently",
      score: -20,
    });
  }

  if (card.verdict === "blunder") {
    reasons.push({
      id: "important-verdict",
      label: "Blunder verdict",
      score: 20,
    });
  }

  for (const tag of IMPORTANT_TAGS) {
    if (card.tags.includes(tag)) {
      reasons.push({
        id: "important-tag",
        label: `Priority tag: ${tag}`,
        score: tag === "missed tactic" ? 16 : 12,
      });
    }
  }

  if (skippedRecently) {
    reasons.push({
      id: "recently-skipped",
      label: "Skipped in a recent session",
      score: 25,
    });
  }

  return {
    cardId: card.id,
    moveSan: card.moveSan,
    ply: card.ply,
    verdict: card.verdict,
    tags: card.tags,
    status: getScheduleStatus(card, successRate, skippedRecently, now),
    priorityScore: Math.max(0, reasons.reduce((total, reason) => total + reason.score, 0)),
    attempts: card.attempts,
    correct: card.correct,
    successRate,
    lastReviewedAt: card.lastReviewedAt,
    lastAttemptResult: lastAttempt?.result,
    skippedRecently,
    openingBucketIds,
    reasons,
  };
}

function getScheduleStatus(
  card: MistakeCard,
  successRate: number,
  skippedRecently: boolean,
  now: Date,
): ReviewScheduleStatus {
  const lastAttempt = card.attemptHistory.at(-1);

  if (card.attempts === 0) {
    return "new";
  }

  if (lastAttempt?.result === "missed") {
    return "due-now";
  }

  if (skippedRecently || (card.attempts >= 2 && successRate < 50)) {
    return "due-soon";
  }

  if (isRememberedRecently(lastAttempt?.result, card.lastReviewedAt, now)) {
    return "stable";
  }

  return "stable";
}

function wasSkippedRecently(cardId: string, summaries: ReviewSessionSummary[], now: Date) {
  return summaries.some((summary) =>
    summary.results?.some(
      (result) =>
        result.cardId === cardId &&
        result.result === "skipped" &&
        daysBetween(result.recordedAt, now) <= RECENT_SKIP_DAYS,
    ),
  );
}

function isRememberedRecently(
  lastAttemptResult: ReviewResult | undefined,
  lastReviewedAt: string | undefined,
  now: Date,
) {
  return (
    lastAttemptResult === "remembered" &&
    Boolean(lastReviewedAt) &&
    daysBetween(lastReviewedAt, now) <= RECENT_REMEMBERED_STABLE_DAYS
  );
}

function daysBetween(value: string | undefined, now: Date) {
  if (!value) {
    return Number.POSITIVE_INFINITY;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return Number.POSITIVE_INFINITY;
  }

  return Math.max(0, (now.getTime() - date.getTime()) / 86_400_000);
}

function getOpeningBucketIdsByCard(openingMap?: OpeningWeaknessMap) {
  const bucketIdsByCard = new Map<string, string[]>();

  for (const bucket of openingMap?.buckets ?? []) {
    for (const cardId of bucket.cardIds) {
      bucketIdsByCard.set(cardId, [...(bucketIdsByCard.get(cardId) ?? []), bucket.id]);
    }
  }

  return bucketIdsByCard;
}

function getScheduleRecommendation(
  dueNowItems: ReviewScheduleItem[],
  dueSoonItems: ReviewScheduleItem[],
  newItems: ReviewScheduleItem[],
  allItems: ReviewScheduleItem[],
) {
  if (allItems.length === 0) {
    return "Create mistake cards to build a review schedule.";
  }

  const topItem = [...dueNowItems, ...dueSoonItems, ...newItems, ...allItems][0];

  if (dueNowItems.length > 0) {
    return `Start with ${dueNowItems.length} due-now card${dueNowItems.length === 1 ? "" : "s"}.`;
  }

  if (dueSoonItems.length > 0) {
    return `Review ${dueSoonItems.length} due-soon card${dueSoonItems.length === 1 ? "" : "s"} before they cool off.`;
  }

  if (newItems.length > 0) {
    return `Introduce ${newItems.length} new card${newItems.length === 1 ? "" : "s"} into review.`;
  }

  return topItem ? "Your current review queue is stable." : "No scheduled review needed yet.";
}

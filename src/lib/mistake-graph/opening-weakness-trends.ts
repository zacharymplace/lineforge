import type { ReviewSessionSummary } from "@/lib/drill-queue/session";
import type {
  OpeningWeaknessBucket,
  OpeningWeaknessBucketId,
  OpeningWeaknessMap,
} from "@/lib/mistake-graph/opening-weakness-map";
import type { DrillAttempt, MistakeCard, MistakeTag } from "@/lib/move-ledger/types";

export type OpeningWeaknessTrendPoint = {
  date: string;
  bucketId: OpeningWeaknessBucketId;
  bucketLabel: string;
  reviewed: number;
  remembered: number;
  missed: number;
  skipped: number;
  successRate: number;
  cardIds: string[];
  topTags: Array<{ tag: MistakeTag; count: number }>;
};

export type OpeningWeaknessTrendBucket = {
  bucketId: OpeningWeaknessBucketId;
  bucketLabel: string;
  reviewed: number;
  remembered: number;
  missed: number;
  skipped: number;
  successRate: number;
  recentSuccessRate: number;
  successRateDelta: number;
  cardIds: string[];
  topTags: Array<{ tag: MistakeTag; count: number }>;
};

export type OpeningWeaknessTrendSummary = {
  totalReviewed: number;
  latestDate?: string;
  latestSuccessRate: number;
  improvingBucket?: OpeningWeaknessTrendBucket;
  worseningBucket?: OpeningWeaknessTrendBucket;
  mostReviewedBucket?: OpeningWeaknessTrendBucket;
  mostMissedBucket?: OpeningWeaknessTrendBucket;
  recommendedNextFocus: string;
};

export type OpeningWeaknessTrend = {
  points: OpeningWeaknessTrendPoint[];
  buckets: OpeningWeaknessTrendBucket[];
  summary: OpeningWeaknessTrendSummary;
};

type TrendEvent = {
  date: string;
  bucketId: OpeningWeaknessBucketId;
  bucketLabel: string;
  cardId: string;
  result: "remembered" | "missed" | "skipped";
  tags: MistakeTag[];
};

export function buildOpeningWeaknessTrend(
  openingMap: OpeningWeaknessMap,
  cards: MistakeCard[],
  sessionSummaries: ReviewSessionSummary[],
): OpeningWeaknessTrend {
  const openingCardsById = new Map(
    cards
      .filter((card) => openingMap.signals.some((signal) => signal.cardId === card.id))
      .map((card) => [card.id, card]),
  );
  const bucketMemberships = getBucketMemberships(openingMap);
  const events = [
    ...getAttemptTrendEvents(openingCardsById, bucketMemberships),
    ...getSkippedSessionTrendEvents(sessionSummaries, openingCardsById, bucketMemberships),
  ];
  const points = buildTrendPoints(events);
  const buckets = buildTrendBuckets(points);

  return {
    points,
    buckets,
    summary: buildTrendSummary(points, buckets),
  };
}

export function getRecommendedOpeningTrendBucket(trend: OpeningWeaknessTrend) {
  return trend.summary.mostMissedBucket ?? trend.summary.worseningBucket ?? trend.summary.mostReviewedBucket;
}

function getBucketMemberships(openingMap: OpeningWeaknessMap) {
  const memberships = new Map<string, Array<Pick<OpeningWeaknessBucket, "id" | "label">>>();

  for (const bucket of openingMap.buckets) {
    for (const cardId of bucket.cardIds) {
      memberships.set(cardId, [
        ...(memberships.get(cardId) ?? []),
        { id: bucket.id, label: bucket.label },
      ]);
    }
  }

  return memberships;
}

function getAttemptTrendEvents(
  cardsById: Map<string, MistakeCard>,
  bucketMemberships: Map<string, Array<Pick<OpeningWeaknessBucket, "id" | "label">>>,
) {
  const events: TrendEvent[] = [];

  for (const card of cardsById.values()) {
    for (const attempt of card.attemptHistory ?? []) {
      events.push(...createEventsForCardAttempt(card, attempt, bucketMemberships));
    }
  }

  return events;
}

function createEventsForCardAttempt(
  card: MistakeCard,
  attempt: DrillAttempt,
  bucketMemberships: Map<string, Array<Pick<OpeningWeaknessBucket, "id" | "label">>>,
) {
  return (bucketMemberships.get(card.id) ?? []).map((bucket) => ({
    date: localDateKey(attempt.attemptedAt),
    bucketId: bucket.id,
    bucketLabel: bucket.label,
    cardId: card.id,
    result: attempt.result,
    tags: card.tags,
  }));
}

function getSkippedSessionTrendEvents(
  sessionSummaries: ReviewSessionSummary[],
  cardsById: Map<string, MistakeCard>,
  bucketMemberships: Map<string, Array<Pick<OpeningWeaknessBucket, "id" | "label">>>,
) {
  const events: TrendEvent[] = [];

  for (const summary of sessionSummaries) {
    for (const result of summary.results ?? []) {
      if (result.result !== "skipped") {
        continue;
      }

      const card = cardsById.get(result.cardId);
      if (!card) {
        continue;
      }

      for (const bucket of bucketMemberships.get(card.id) ?? []) {
        events.push({
          date: localDateKey(result.recordedAt),
          bucketId: bucket.id,
          bucketLabel: bucket.label,
          cardId: card.id,
          result: "skipped",
          tags: card.tags,
        });
      }
    }
  }

  return events;
}

function buildTrendPoints(events: TrendEvent[]) {
  const pointMap = new Map<string, TrendEvent[]>();

  for (const event of events) {
    const key = `${event.date}:${event.bucketId}`;
    pointMap.set(key, [...(pointMap.get(key) ?? []), event]);
  }

  return [...pointMap.values()]
    .map(toTrendPoint)
    .sort((a, b) => a.date.localeCompare(b.date) || a.bucketLabel.localeCompare(b.bucketLabel));
}

function toTrendPoint(events: TrendEvent[]): OpeningWeaknessTrendPoint {
  const [firstEvent] = events;
  const remembered = events.filter((event) => event.result === "remembered").length;
  const missed = events.filter((event) => event.result === "missed").length;
  const skipped = events.filter((event) => event.result === "skipped").length;

  return {
    date: firstEvent.date,
    bucketId: firstEvent.bucketId,
    bucketLabel: firstEvent.bucketLabel,
    reviewed: remembered + missed + skipped,
    remembered,
    missed,
    skipped,
    successRate: remembered + missed > 0 ? Math.round((remembered / (remembered + missed)) * 100) : 0,
    cardIds: [...new Set(events.map((event) => event.cardId))],
    topTags: getTopTags(events),
  };
}

function buildTrendBuckets(points: OpeningWeaknessTrendPoint[]) {
  const bucketMap = new Map<OpeningWeaknessBucketId, OpeningWeaknessTrendPoint[]>();

  for (const point of points) {
    bucketMap.set(point.bucketId, [...(bucketMap.get(point.bucketId) ?? []), point]);
  }

  return [...bucketMap.values()]
    .map(toTrendBucket)
    .sort((a, b) => b.reviewed - a.reviewed || b.missed - a.missed);
}

function toTrendBucket(points: OpeningWeaknessTrendPoint[]): OpeningWeaknessTrendBucket {
  const remembered = points.reduce((total, point) => total + point.remembered, 0);
  const missed = points.reduce((total, point) => total + point.missed, 0);
  const skipped = points.reduce((total, point) => total + point.skipped, 0);
  const successRate = remembered + missed > 0 ? Math.round((remembered / (remembered + missed)) * 100) : 0;
  const firstSuccessRate = getComparableSuccessRate(points[0]);
  const recentSuccessRate = getComparableSuccessRate(points.at(-1));

  return {
    bucketId: points[0].bucketId,
    bucketLabel: points[0].bucketLabel,
    reviewed: remembered + missed + skipped,
    remembered,
    missed,
    skipped,
    successRate,
    recentSuccessRate,
    successRateDelta: recentSuccessRate - firstSuccessRate,
    cardIds: [...new Set(points.flatMap((point) => point.cardIds))],
    topTags: mergeTopTags(points),
  };
}

function buildTrendSummary(
  points: OpeningWeaknessTrendPoint[],
  buckets: OpeningWeaknessTrendBucket[],
): OpeningWeaknessTrendSummary {
  const latestDate = points.at(-1)?.date;
  const latestPoints = latestDate ? points.filter((point) => point.date === latestDate) : [];
  const latestRemembered = latestPoints.reduce((total, point) => total + point.remembered, 0);
  const latestMissed = latestPoints.reduce((total, point) => total + point.missed, 0);
  const improvingBucket = [...buckets]
    .filter((bucket) => bucket.successRateDelta > 0)
    .sort((a, b) => b.successRateDelta - a.successRateDelta || b.reviewed - a.reviewed)[0];
  const worseningBucket = [...buckets]
    .filter((bucket) => bucket.successRateDelta < 0)
    .sort((a, b) => a.successRateDelta - b.successRateDelta || b.reviewed - a.reviewed)[0];
  const mostReviewedBucket = [...buckets].sort((a, b) => b.reviewed - a.reviewed)[0];
  const mostMissedBucket = [...buckets].sort((a, b) => b.missed - a.missed || b.reviewed - a.reviewed)[0];

  return {
    totalReviewed: points.reduce((total, point) => total + point.reviewed, 0),
    latestDate,
    latestSuccessRate:
      latestRemembered + latestMissed > 0
        ? Math.round((latestRemembered / (latestRemembered + latestMissed)) * 100)
        : 0,
    improvingBucket,
    worseningBucket,
    mostReviewedBucket,
    mostMissedBucket,
    recommendedNextFocus: getRecommendedFocus(mostMissedBucket, worseningBucket, mostReviewedBucket),
  };
}

function getRecommendedFocus(
  mostMissedBucket: OpeningWeaknessTrendBucket | undefined,
  worseningBucket: OpeningWeaknessTrendBucket | undefined,
  mostReviewedBucket: OpeningWeaknessTrendBucket | undefined,
) {
  if (mostMissedBucket && mostMissedBucket.missed > 0) {
    return `Based on local review history, focus next on ${mostMissedBucket.bucketLabel.toLowerCase()}.`;
  }

  if (worseningBucket) {
    return `Based on local review history, ${worseningBucket.bucketLabel.toLowerCase()} is trending down.`;
  }

  if (mostReviewedBucket) {
    return `Based on local review history, keep ${mostReviewedBucket.bucketLabel.toLowerCase()} in rotation.`;
  }

  return "Review opening cards to build a local trend history.";
}

function getComparableSuccessRate(point: OpeningWeaknessTrendPoint | undefined) {
  return point && point.remembered + point.missed > 0 ? point.successRate : 0;
}

function getTopTags(events: TrendEvent[]) {
  const tagCounts = new Map<MistakeTag, number>();

  for (const event of events) {
    for (const tag of event.tags) {
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }
  }

  return [...tagCounts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
    .slice(0, 5);
}

function mergeTopTags(points: OpeningWeaknessTrendPoint[]) {
  const tagCounts = new Map<MistakeTag, number>();

  for (const point of points) {
    for (const tag of point.topTags) {
      tagCounts.set(tag.tag, (tagCounts.get(tag.tag) ?? 0) + tag.count);
    }
  }

  return [...tagCounts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
    .slice(0, 5);
}

function localDateKey(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Unknown date";
  }

  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

"use client";

import { useMemo, useState } from "react";
import { Chessboard } from "react-chessboard";
import { CoachLensComparison } from "./CoachLensComparison";
import { OpeningWeaknessMapPanel } from "./OpeningWeaknessMapPanel";
import { OpeningWeaknessTrendPanel } from "./OpeningWeaknessTrendPanel";
import { ReviewSchedulePanel } from "./ReviewSchedulePanel";
import { ReviewSessionHistoryPanel } from "./ReviewSessionHistoryPanel";
import { ScheduleBadge } from "./ScheduleBadge";
import type { CoachLensId } from "@/lib/coach-lenses/types";
import { evaluateDrillMove } from "@/lib/drill-queue/review";
import type { ReviewScheduleSummary } from "@/lib/drill-queue/schedule";
import {
  loadReviewSessionSizePreference,
  saveReviewSessionSizePreference,
} from "@/lib/drill-queue/session-preferences";
import {
  REVIEW_SESSION_SIZE_OPTIONS,
  buildMissedOnlyRepeatSession,
  buildReviewSession,
  buildReviewSessionFromCardIds,
  completeReviewSession,
  recordReviewSessionResult,
  type ReviewSession,
  type ReviewSessionFilter,
  type ReviewSessionResult,
  type ReviewSessionSize,
  type ReviewSessionSummary,
} from "@/lib/drill-queue/session";
import {
  buildOpeningWeaknessReviewCardIds,
  type OpeningWeaknessBucket,
  type OpeningWeaknessMap,
} from "@/lib/mistake-graph/opening-weakness-map";
import type {
  OpeningWeaknessTrend,
  OpeningWeaknessTrendBucket,
} from "@/lib/mistake-graph/opening-weakness-trends";
import {
  MISTAKE_TAGS,
  MOVE_VERDICTS,
  type MistakeCard,
  type MistakeTag,
  type MoveVerdict,
  type ReviewResult,
} from "@/lib/move-ledger/types";

type ReviewSessionPanelProps = {
  cards: MistakeCard[];
  comparisonLensIds: CoachLensId[];
  sessionSummaries?: ReviewSessionSummary[];
  reviewSchedule?: ReviewScheduleSummary;
  openingMap?: OpeningWeaknessMap;
  openingTrend?: OpeningWeaknessTrend;
  activeGameId?: string | null;
  onRecordCardReview: (cardId: string, result: ReviewResult) => void;
  onCompleteSession: (summary: ReviewSessionSummary) => void;
  onClearSessionHistory?: () => void;
};

type FilterKind = Exclude<
  ReviewSessionFilter["type"],
  "missed-only-repeat" | "opening-weakness" | "due-review"
>;

export function ReviewSessionPanel({
  cards,
  comparisonLensIds,
  sessionSummaries = [],
  reviewSchedule,
  openingMap,
  openingTrend,
  activeGameId,
  onRecordCardReview,
  onCompleteSession,
  onClearSessionHistory,
}: ReviewSessionPanelProps) {
  const [filterKind, setFilterKind] = useState<FilterKind>("all");
  const [filterVerdict, setFilterVerdict] = useState<MoveVerdict>("mistake");
  const [filterTag, setFilterTag] = useState<MistakeTag>("missed tactic");
  const [sessionSize, setSessionSize] = useState<ReviewSessionSize>(() =>
    loadReviewSessionSizePreference(),
  );
  const [session, setSession] = useState<ReviewSession | null>(null);
  const [lastSummary, setLastSummary] = useState<ReviewSessionSummary | null>(null);
  const filter = useMemo(
    () => buildFilter(filterKind, filterVerdict, filterTag),
    [filterKind, filterVerdict, filterTag],
  );
  const currentCardId = session?.selectedCardIds[session.currentCardIndex] ?? null;
  const currentCard = currentCardId
    ? cards.find((card) => card.id === currentCardId) ?? null
    : null;
  const currentScheduleItem =
    currentCardId && reviewSchedule
      ? reviewSchedule.items.find((item) => item.cardId === currentCardId)
      : undefined;

  function startSession() {
    const nextSession = buildReviewSession(cards, filter, sessionSize);
    setSession(nextSession);
    setLastSummary(null);
  }

  function startMissedOnlyRepeatSession(summary: ReviewSessionSummary) {
    const nextSession = buildMissedOnlyRepeatSession(cards, summary);
    setSession(nextSession);
    setLastSummary(null);
  }

  function startOpeningWeaknessBucketSession(bucket: OpeningWeaknessBucket) {
    startOpeningWeaknessCardIdsSession(buildOpeningWeaknessReviewCardIds(bucket), bucket.id);
  }

  function startOpeningWeaknessCardIdsSession(cardIds: string[], bucketId = "filtered") {
    const nextSession = buildReviewSessionFromCardIds(
      cards,
      cardIds,
      { type: "opening-weakness", bucketId },
    );
    setSession(nextSession);
    setLastSummary(null);
  }

  function startOpeningTrendBucketSession(bucket: OpeningWeaknessTrendBucket) {
    startOpeningWeaknessCardIdsSession(bucket.cardIds, bucket.bucketId);
  }

  function startDueReviewSession(cardIds: string[]) {
    const nextSession = buildReviewSessionFromCardIds(cards, cardIds, { type: "due-review" });
    setSession(nextSession);
    setLastSummary(null);
  }

  function recordResult(
    result: ReviewResult | "skipped",
    details: Pick<
      ReviewSessionResult,
      "attemptedMoveSan" | "attemptedFenAfter" | "expectedMoveSan"
    > = {},
  ) {
    if (!session || !currentCard) {
      return;
    }

    if (result !== "skipped") {
      onRecordCardReview(currentCard.id, result);
    }

    const nextSession = recordReviewSessionResult(session, currentCard.id, result, {
      expectedMoveSan: currentCard.moveSan,
      ...details,
    });
    setSession(nextSession);

    if (nextSession.currentCardIndex >= nextSession.selectedCardIds.length) {
      finishSession(nextSession);
    }
  }

  function finishSession(sessionToComplete = session) {
    if (!sessionToComplete) {
      return;
    }

    const summary = completeReviewSession(sessionToComplete, cards);
    setLastSummary(summary);
    setSession(null);
    onCompleteSession(summary);
  }

  function attemptMove(sourceSquare: string, targetSquare: string) {
    if (!currentCard) {
      return false;
    }

    const result = evaluateDrillMove(currentCard, sourceSquare, targetSquare);
    recordResult(result.reviewResult, {
      attemptedMoveSan: result.attemptedSan ?? undefined,
      attemptedFenAfter: result.attemptedFenAfter ?? undefined,
      expectedMoveSan: result.expectedSan,
    });
    return result.isMatch;
  }

  return (
    <>
      <section className="grid gap-4 rounded-lg border border-stone-800 bg-stone-950/80 p-4">
      <div>
        <h2 className="text-lg font-semibold text-stone-100">Review session</h2>
        <p className="text-sm text-stone-500">Drill a filtered queue of mistake cards.</p>
      </div>

      {!session ? (
        <div className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="grid gap-1 text-sm">
              <span className="text-stone-500">Filter</span>
              <select
                className="lf-field"
                value={filterKind}
                onChange={(event) => setFilterKind(event.target.value as FilterKind)}
              >
                <option value="all">All cards</option>
                <option value="verdict">By verdict</option>
                <option value="tag">By tag</option>
                <option value="missed-recently">Missed recently</option>
                <option value="lowest-success-rate">Lowest success rate</option>
                <option value="most-recent">Most recent cards</option>
              </select>
            </label>

            {filterKind === "verdict" ? (
              <label className="grid gap-1 text-sm">
                <span className="text-stone-500">Verdict</span>
                <select
                  className="lf-field"
                  value={filterVerdict}
                  onChange={(event) => setFilterVerdict(event.target.value as MoveVerdict)}
                >
                  {MOVE_VERDICTS.map((verdict) => (
                    <option key={verdict} value={verdict}>
                      {verdict}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            {filterKind === "tag" ? (
              <label className="grid gap-1 text-sm">
                <span className="text-stone-500">Tag</span>
                <select
                  className="lf-field"
                  value={filterTag}
                  onChange={(event) => setFilterTag(event.target.value as MistakeTag)}
                >
                  {MISTAKE_TAGS.map((tag) => (
                    <option key={tag} value={tag}>
                      {tag}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            <label className="grid gap-1 text-sm">
              <span className="text-stone-500">Session size</span>
              <select
                className="lf-field"
                value={String(sessionSize)}
                onChange={(event) => setSessionSize(saveReviewSessionSizePreference(event.target.value))}
              >
                {REVIEW_SESSION_SIZE_OPTIONS.map((size) => (
                  <option key={size} value={String(size)}>
                    {size === "all" ? "All available" : size}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex flex-wrap gap-2">
            <button className="lf-button-primary" disabled={cards.length === 0} onClick={startSession}>
              Start session
            </button>
            {cards.length === 0 ? (
              <span className="text-sm text-stone-500">Create mistake cards to start a session.</span>
            ) : null}
          </div>
        </div>
      ) : null}

      {session && currentCard ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(220px,320px)_1fr]">
          <div className="grid gap-3">
            <div className="text-sm text-stone-500">
              Card {session.currentCardIndex + 1} of {session.selectedCardIds.length}
            </div>
            <div className="overflow-hidden rounded-lg border border-stone-800 bg-stone-950 p-2">
              <Chessboard
                options={{
                  id: `session-${session.id}-${currentCard.id}`,
                  position: currentCard.fenBefore,
                  boardStyle: { borderRadius: "6px" },
                  darkSquareStyle: { backgroundColor: "#6f5b43" },
                  lightSquareStyle: { backgroundColor: "#d7c7a4" },
                  onPieceDrop: ({ sourceSquare, targetSquare }) => {
                    if (!targetSquare) {
                      return false;
                    }

                    return attemptMove(sourceSquare, targetSquare);
                  },
                }}
              />
            </div>
          </div>

          <div className="grid gap-3">
            <div className="rounded-md bg-black/30 p-3 text-sm">
              <div className="font-mono text-amber-100">{currentCard.moveSan}</div>
              <div className="text-stone-300">{currentCard.prompt}</div>
              <div className="text-xs text-stone-500">
                {currentCard.verdict} · {currentCard.tags.join(", ") || "no tags"}
              </div>
              <div className="mt-2">
                <ScheduleBadge item={currentScheduleItem} />
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button className="lf-button-primary" onClick={() => recordResult("remembered")}>
                Remembered
              </button>
              <button className="lf-button" onClick={() => recordResult("missed")}>
                Missed
              </button>
              <button className="lf-button" onClick={() => recordResult("skipped")}>
                Skip
              </button>
              <button className="lf-button" onClick={() => finishSession()}>
                End session
              </button>
            </div>

            <CoachLensComparison
              input={{
                moveSan: currentCard.moveSan,
                ply: currentCard.ply,
                fenBefore: currentCard.fenBefore,
                fenAfter: currentCard.fenAfter,
                verdict: currentCard.verdict,
                tags: currentCard.tags,
                userNote: currentCard.note,
                engineAnalysis: currentCard.engineAnalysis,
                attempts: currentCard.attempts,
                correct: currentCard.correct,
                lastAttemptResult: currentCard.attemptHistory.at(-1)?.result,
              }}
              selectedLensIds={comparisonLensIds}
              onSelectedLensIdsChange={() => undefined}
            />
          </div>
        </div>
      ) : null}

      {lastSummary ? (
        <SessionSummary
          summary={lastSummary}
          onReviewMissedAgain={
            lastSummary.missedCardIds.length > 0
              ? () => startMissedOnlyRepeatSession(lastSummary)
              : undefined
          }
        />
      ) : null}
      </section>
      {openingMap ? (
        <OpeningWeaknessMapPanel
          openingMap={openingMap}
          reviewSchedule={reviewSchedule}
          activeGameId={activeGameId}
          onStartBucketReview={startOpeningWeaknessBucketSession}
          onStartCardIdsReview={(cardIds) => startOpeningWeaknessCardIdsSession(cardIds)}
        />
      ) : null}
      {openingTrend ? (
        <OpeningWeaknessTrendPanel
          trend={openingTrend}
          onStartBucketReview={startOpeningTrendBucketSession}
        />
      ) : null}
      {reviewSchedule ? (
        <ReviewSchedulePanel
          schedule={reviewSchedule}
          onStartDueReview={startDueReviewSession}
        />
      ) : null}
      <ReviewSessionHistoryPanel
        summaries={sessionSummaries}
        cards={cards}
        onReviewMissedAgain={startMissedOnlyRepeatSession}
        onClearHistory={onClearSessionHistory ?? (() => undefined)}
      />
    </>
  );
}

function SessionSummary({
  summary,
  onReviewMissedAgain,
}: {
  summary: ReviewSessionSummary;
  onReviewMissedAgain?: () => void;
}) {
  return (
    <div className="grid gap-3 rounded-md border border-stone-800 bg-black/30 p-3 text-sm">
      <div className="font-medium text-stone-100">Session summary</div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        <Metric label="Size" value={summary.sessionCardCount} />
        <Metric label="Reviewed" value={summary.totalReviewed} />
        <Metric label="Remembered" value={summary.remembered} />
        <Metric label="Missed" value={summary.missed} />
        <Metric label="Missed cards" value={summary.missedCardIds.length} />
        <Metric label="Skipped" value={summary.skipped} />
        <Metric label="Success" value={`${summary.successRate}%`} />
      </div>
      <div className="grid gap-2 lg:grid-cols-2">
        <div>
          <div className="text-stone-500">Top missed tags</div>
          <div className="text-stone-300">
            {summary.topMissedTags.length
              ? summary.topMissedTags.map((item) => `${item.tag} (${item.count})`).join(", ")
              : "No missed tags."}
          </div>
        </div>
        <div>
          <div className="text-stone-500">Verdicts</div>
          <div className="text-stone-300">
            {summary.verdictBreakdown.map((item) => `${item.verdict} (${item.count})`).join(", ") || "None"}
          </div>
        </div>
      </div>
      <div className="rounded-md border border-stone-800 bg-stone-950 p-2 text-stone-200">
        <span className="text-stone-500">Next action: </span>
        {summary.recommendedNextAction}
      </div>
      {onReviewMissedAgain ? (
        <button className="lf-button-primary w-fit" onClick={onReviewMissedAgain}>
          Review missed cards again
        </button>
      ) : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-md bg-stone-950 p-2">
      <div className="text-xs text-stone-500">{label}</div>
      <div className="font-semibold text-amber-100">{value}</div>
    </div>
  );
}

function buildFilter(
  filterKind: FilterKind,
  verdict: MoveVerdict,
  tag: MistakeTag,
): ReviewSessionFilter {
  if (filterKind === "verdict") return { type: "verdict", verdict };
  if (filterKind === "tag") return { type: "tag", tag };
  return { type: filterKind };
}

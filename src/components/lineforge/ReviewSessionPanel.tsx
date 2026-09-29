"use client";

import { useMemo, useState } from "react";
import { CorrectionAnswer } from "./CorrectionAnswer";
import { ReviewMoveInput } from "./ReviewMoveInput";
import { Chessboard } from "react-chessboard";
import { CoachLensComparison } from "./CoachLensComparison";
import { OpeningWeaknessMapPanel } from "./OpeningWeaknessMapPanel";
import { OpeningWeaknessTrendPanel } from "./OpeningWeaknessTrendPanel";
import { ReviewSchedulePanel } from "./ReviewSchedulePanel";
import { ReviewSessionHistoryPanel } from "./ReviewSessionHistoryPanel";
import { ScheduleBadge } from "./ScheduleBadge";
import type { CoachLensId } from "@/lib/coach-lenses/types";
import { evaluateDrillMove, evaluateDrillSan, getReviewTarget } from "@/lib/drill-queue/review";
import type { ReviewScheduleSummary } from "@/lib/drill-queue/schedule";
import type {
  ReviewScheduleIntervalPreset,
  ReviewSchedulePreferences,
} from "@/lib/drill-queue/schedule-preferences";
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
  type DrillAttemptResult,
  type MistakeTag,
  type MoveVerdict,
  type ReviewResult,
} from "@/lib/move-ledger/types";

type ReviewSessionPanelProps = {
  cards: MistakeCard[];
  onSessionActiveChange?: (active: boolean) => void;
  comparisonLensIds: CoachLensId[];
  sessionSummaries?: ReviewSessionSummary[];
  reviewSchedule?: ReviewScheduleSummary;
  schedulePreferences: ReviewSchedulePreferences;
  onSchedulePresetChange: (preset: ReviewScheduleIntervalPreset) => void;
  displayMode: "review" | "weaknesses";
  openingMap?: OpeningWeaknessMap;
  openingTrend?: OpeningWeaknessTrend;
  activeGameId?: string | null;
  onRecordCardReview: (cardId: string, result: ReviewResult, played?: DrillAttemptResult) => void;
  onCompleteSession: (summary: ReviewSessionSummary) => void;
  onClearSessionHistory?: () => void;
  onRequestReviewView?: () => void;
};

type FilterKind = Exclude<
  ReviewSessionFilter["type"],
  "missed-only-repeat" | "opening-weakness" | "due-review"
>;

export function ReviewSessionPanel({
  cards,
  onSessionActiveChange,
  comparisonLensIds,
  sessionSummaries = [],
  reviewSchedule,
  schedulePreferences,
  onSchedulePresetChange,
  displayMode,
  openingMap,
  openingTrend,
  activeGameId,
  onRecordCardReview,
  onCompleteSession,
  onClearSessionHistory,
  onRequestReviewView,
}: ReviewSessionPanelProps) {
  const [filterKind, setFilterKind] = useState<FilterKind>("all");
  const [filterVerdict, setFilterVerdict] = useState<MoveVerdict>("mistake");
  const [filterTag, setFilterTag] = useState<MistakeTag>("missed tactic");
  const [sessionSize, setSessionSize] = useState<ReviewSessionSize>(() =>
    loadReviewSessionSizePreference(),
  );
  const [revealed, setRevealed] = useState(false);
  const [pendingAttempt, setPendingAttempt] = useState<DrillAttemptResult | null>(null);
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
  const currentCardActionLabel = currentCard
    ? `card ${session ? session.currentCardIndex + 1 : 1}`
    : "current card";

  function startSession() {
    const nextSession = buildReviewSession(cards, filter, sessionSize);
    setRevealed(false);
    setPendingAttempt(null);
    setSession(nextSession);
    onSessionActiveChange?.(Boolean(nextSession && nextSession.selectedCardIds.length > 0));
    setLastSummary(null);
  }

  function startMissedOnlyRepeatSession(summary: ReviewSessionSummary) {
    const nextSession = buildMissedOnlyRepeatSession(cards, summary);
    setRevealed(false);
    setPendingAttempt(null);
    setSession(nextSession);
    onSessionActiveChange?.(Boolean(nextSession && nextSession.selectedCardIds.length > 0));
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
    setRevealed(false);
    setPendingAttempt(null);
    setSession(nextSession);
    onSessionActiveChange?.(Boolean(nextSession && nextSession.selectedCardIds.length > 0));
    setLastSummary(null);
    onRequestReviewView?.();
  }

  function startOpeningTrendBucketSession(bucket: OpeningWeaknessTrendBucket) {
    startOpeningWeaknessCardIdsSession(bucket.cardIds, bucket.bucketId);
  }

  function startDueReviewSession(cardIds: string[]) {
    const nextSession = buildReviewSessionFromCardIds(cards, cardIds, { type: "due-review" });
    setRevealed(false);
    setPendingAttempt(null);
    setSession(nextSession);
    onSessionActiveChange?.(Boolean(nextSession && nextSession.selectedCardIds.length > 0));
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
      onRecordCardReview(currentCard.id, result, pendingAttempt ?? undefined);
    }

    const nextSession = recordReviewSessionResult(session, currentCard.id, result, {
      expectedMoveSan: getReviewTarget(currentCard).moveSan,
      ...details,
    });
    setRevealed(false);
    setPendingAttempt(null);
    setSession(nextSession);
    onSessionActiveChange?.(Boolean(nextSession && nextSession.selectedCardIds.length > 0));

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
    onSessionActiveChange?.(false);
    onCompleteSession(summary);
  }

  function attemptMove(sourceSquare: string, targetSquare: string) {
    if (!currentCard) {
      return false;
    }

    const result = evaluateDrillMove(currentCard, sourceSquare, targetSquare);
    setPendingAttempt(result);
    setRevealed(true);
    return result.isMatch;
  }

  return (
    <>
      {displayMode === "review" ? (
        <section className="grid gap-4 border-[1.5px] border-ink bg-paper-2 p-4">
      <div>
        <h2 className="text-lg font-semibold text-ink">Review session</h2>
        <p className="text-sm text-ink-muted">Drill a filtered queue of mistake cards.</p>
      </div>

      {!session ? (
        <div className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="grid gap-1 text-sm">
              <span className="text-ink-muted">Filter</span>
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
                <span className="text-ink-muted">Verdict</span>
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
                <span className="text-ink-muted">Tag</span>
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
              <span className="text-ink-muted">Session size</span>
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
            <button
              className="lf-button-primary"
              disabled={cards.length === 0}
              aria-label="Start review session with the selected filter and size"
              onClick={startSession}
            >
              Start session
            </button>
            {cards.length === 0 ? (
              <span className="text-sm text-ink-muted">Create mistake cards to start a session.</span>
            ) : null}
          </div>
        </div>
      ) : null}

      {session && currentCard ? (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(220px,320px)_1fr]">
          <div className="grid gap-3">
            <div className="text-sm text-ink-muted" role="status" aria-live="polite">
              Card {session.currentCardIndex + 1} of {session.selectedCardIds.length}
            </div>
            <div
              className="overflow-hidden border-[1.5px] border-ink bg-paper p-2"
              aria-label={`Review board for ${currentCardActionLabel}`}
            >
              <Chessboard
                options={{
                  id: `session-${session.id}-${currentCard.id}`,
                  position: currentCard.fenBefore,
                  allowDragging: !revealed,
                  boardStyle: { borderRadius: "6px", aspectRatio: "1 / 1", height: "auto" },
                  darkSquareStyle: { backgroundColor: "#6f5b43" },
                  lightSquareStyle: { backgroundColor: "#d7c7a4" },
                  onPieceDrop: ({ sourceSquare, targetSquare }) => {
                    if (!targetSquare || revealed) {
                      return false;
                    }

                    return attemptMove(sourceSquare, targetSquare);
                  },
                }}
              />
            </div>
          </div>

          <div className="grid gap-3">
            <div className="bg-paper-2 p-3 text-sm">
              <div className="text-ink">{currentCard.correction ? "Correction card" : "Game recall"}</div>
              <div className="text-ink-2">{currentCard.correction ? "Play your saved correction." : `Find the move played on ply ${currentCard.ply}.`}</div>
              <div className="text-xs text-ink-muted">
                {currentCard.verdict} · {currentCard.tags.join(", ") || "no tags"}
              </div>
              <div className="mt-2">
                <ScheduleBadge item={currentScheduleItem} />
              </div>
            </div>

            {!revealed ? <>
              <ReviewMoveInput key={currentCard.id} onAttempt={san => { setPendingAttempt(evaluateDrillSan(currentCard, san)); setRevealed(true); }} />
              <button className="lf-button" onClick={() => setRevealed(true)}>Reveal session answer</button>
            </> : <>
              <CorrectionAnswer card={currentCard} />
              {pendingAttempt ? <div role="status">
                <p>{pendingAttempt.isMatch ? "Matches your saved target." : `Does not match your saved target. Played: ${pendingAttempt.attemptedSan ?? "invalid move"}.`}</p>
                <button className="lf-button-primary" onClick={() => recordResult(pendingAttempt.reviewResult, { attemptedMoveSan: pendingAttempt.attemptedSan ?? undefined, attemptedFenAfter: pendingAttempt.attemptedFenAfter ?? undefined, expectedMoveSan: pendingAttempt.expectedSan })}>Record result and continue</button>
              </div> : null}
            </>}
            <div className="flex flex-wrap gap-2">
              <button
                disabled={!revealed || Boolean(pendingAttempt)}
                className="lf-button-primary"
                aria-label={`Mark ${currentCardActionLabel} as remembered`}
                onClick={() => recordResult("remembered")}
              >
                Remembered
              </button>
              <button
                className="lf-button"
                disabled={!revealed || Boolean(pendingAttempt)}
                aria-label={`Mark ${currentCardActionLabel} as missed`}
                onClick={() => recordResult("missed")}
              >
                Missed
              </button>
              <button
                className="lf-button"
                disabled={Boolean(pendingAttempt)}
                aria-label={`Skip ${currentCardActionLabel}`}
                onClick={() => recordResult("skipped")}
              >
                Skip
              </button>
              <button
                className="lf-button"
                aria-label="End the current review session"
                onClick={() => finishSession()}
              >
                End session
              </button>
            </div>

            {revealed ? <CoachLensComparison
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
            /> : null}
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
      ) : null}
      {displayMode === "weaknesses" && openingMap ? (
        <OpeningWeaknessMapPanel
          openingMap={openingMap}
          reviewSchedule={reviewSchedule}
          activeGameId={activeGameId}
          onStartBucketReview={startOpeningWeaknessBucketSession}
          onStartCardIdsReview={(cardIds) => startOpeningWeaknessCardIdsSession(cardIds)}
        />
      ) : null}
      {displayMode === "weaknesses" && openingTrend ? (
        <OpeningWeaknessTrendPanel
          trend={openingTrend}
          onStartBucketReview={startOpeningTrendBucketSession}
        />
      ) : null}
      {displayMode === "review" && !session && reviewSchedule ? (
        <ReviewSchedulePanel
          schedule={reviewSchedule}
          preferences={schedulePreferences}
          onPresetChange={onSchedulePresetChange}
          onStartDueReview={startDueReviewSession}
        />
      ) : null}
      {displayMode === "review" && !session ? (
        <details><summary className="lf-button cursor-pointer">Completed session history (includes answers)</summary><ReviewSessionHistoryPanel
          summaries={sessionSummaries}
          cards={cards}
          onReviewMissedAgain={startMissedOnlyRepeatSession}
          onClearHistory={onClearSessionHistory ?? (() => undefined)}
        /></details>
      ) : null}
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
    <div className="grid gap-3 border-[1.5px] border-ink bg-paper-2 p-3 text-sm">
      <div className="font-medium text-ink">Session summary</div>
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
          <div className="text-ink-muted">Top missed tags</div>
          <div className="text-ink-2">
            {summary.topMissedTags.length
              ? summary.topMissedTags.map((item) => `${item.tag} (${item.count})`).join(", ")
              : "No missed tags."}
          </div>
        </div>
        <div>
          <div className="text-ink-muted">Verdicts</div>
          <div className="text-ink-2">
            {summary.verdictBreakdown.map((item) => `${item.verdict} (${item.count})`).join(", ") || "None"}
          </div>
        </div>
      </div>
      <div className="border-[1.5px] border-ink bg-paper p-2 text-ink-2">
        <span className="text-ink-muted">Next action: </span>
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
    <div className="bg-paper p-2">
      <div className="text-xs text-ink-muted">{label}</div>
      <div className="font-semibold text-ink">{value}</div>
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

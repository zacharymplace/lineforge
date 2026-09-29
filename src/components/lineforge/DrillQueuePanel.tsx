"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CorrectionAnswer } from "./CorrectionAnswer";
import { ReviewMoveInput } from "./ReviewMoveInput";
import { Chessboard } from "react-chessboard";
import {
  DEFAULT_COACH_LENS_ID,
  buildCoachLensComparisonOutputs,
  buildCoachLensOutput,
} from "@/lib/coach-lenses/lenses";
import type { CoachLensId, CoachLensInput } from "@/lib/coach-lenses/types";
import {
  loadDrillQueueScheduleFilterPreference,
  saveDrillQueueScheduleFilterPreference,
} from "@/lib/drill-queue/filter-preferences";
import { getSuccessRate } from "@/lib/drill-queue/review";
import {
  formatAnalysisTimestamp,
  formatEvaluation,
  getStoredAnalysisLabel,
} from "@/lib/engine/local-engine";
import { buildExplanationSummary } from "@/lib/explanations/templates";
import type { DrillAttemptResult, MistakeCard, ReviewResult } from "@/lib/move-ledger/types";
import { buildCardReviewPacket } from "@/lib/review-packets/build";
import type { ReviewPacket } from "@/lib/review-packets/types";
import {
  clearTransientMessageState,
  createTransientMessageState,
  type TransientMessageState,
} from "@/lib/ui/transient-message";
import { CoachLensComparison } from "./CoachLensComparison";
import { CoachLensPanel } from "./CoachLensPanel";
import { ReviewPacketPreviewModal } from "./ReviewPacketPreviewModal";
import { ReviewSummary } from "./ReviewSummary";
import { ScheduleBadge } from "./ScheduleBadge";
import { StatusHint } from "./StatusHint";
import {
  clearDrillQueueFilterChip,
  DEFAULT_DRILL_QUEUE_CARD_FILTER,
  DRILL_QUEUE_LAST_REVIEWED_FILTERS,
  DRILL_QUEUE_SCHEDULE_FILTERS,
  filterDrillQueueCards,
  getActiveDrillQueueFilterChips,
  getDrillQueueScheduleFilterLabel,
  getLastReviewedFilterLabel,
  getSourceGameFilterLabel,
  getVisibleScheduleSelectedCardId,
  normalizeDrillQueueScheduleFilter,
  type DrillQueueCardFilter,
  type DrillQueueFilterChipId,
  type DrillQueueLastReviewedFilter,
  type DrillQueueScheduleFilter,
  type DrillQueueSourceGameFilter,
  type ReviewScheduleSummary,
} from "@/lib/drill-queue/schedule";

type DrillQueuePanelProps = {
  cards: MistakeCard[];
  activeGameId?: string;
  activeGameName?: string;
  sourceGameNames?: Record<string, string>;
  reviewSchedule?: ReviewScheduleSummary;
  comparisonLensIds: CoachLensId[];
  onComparisonLensIdsChange: (lensIds: CoachLensId[]) => void;
  selectedCardId: string | null;
  revealed: boolean;
  onSelectCard: (cardId: string) => void;
  onReveal: () => void;
  onReview: (cardId: string, result: ReviewResult) => void;
  onAttemptMove: (
    card: MistakeCard,
    sourceSquare: string,
    targetSquare: string,
  ) => DrillAttemptResult;
  attemptResult: DrillAttemptResult | null;
};

export function DrillQueuePanel({
  cards,
  activeGameId,
  activeGameName,
  sourceGameNames,
  reviewSchedule,
  comparisonLensIds,
  onComparisonLensIdsChange,
  selectedCardId,
  revealed,
  onSelectCard,
  onReveal,
  onReview,
  onAttemptMove,
  attemptResult,
}: DrillQueuePanelProps) {
  const [scheduleFilter, setScheduleFilter] = useState<DrillQueueScheduleFilter>(() =>
    normalizeDrillQueueScheduleFilter(loadDrillQueueScheduleFilterPreference()),
  );
  const [sourceGameFilter, setSourceGameFilter] = useState<DrillQueueSourceGameFilter>(
    DEFAULT_DRILL_QUEUE_CARD_FILTER.sourceGameFilter,
  );
  const [lastReviewedFilter, setLastReviewedFilter] = useState<DrillQueueLastReviewedFilter>(
    DEFAULT_DRILL_QUEUE_CARD_FILTER.lastReviewedFilter,
  );
  const sourceGameOptions = useMemo(() => {
    const cardSourceGameIds = new Set(
      cards.map((card) => card.sourceGameId).filter((sourceGameId): sourceGameId is string => Boolean(sourceGameId)),
    );

    return [...cardSourceGameIds]
      .filter((sourceGameId) => Boolean(sourceGameNames?.[sourceGameId]))
      .sort((firstId, secondId) =>
        (sourceGameNames?.[firstId] ?? firstId).localeCompare(sourceGameNames?.[secondId] ?? secondId),
      );
  }, [cards, sourceGameNames]);
  const drillQueueCardFilter = useMemo<DrillQueueCardFilter>(
    () => ({
      scheduleFilter,
      sourceGameFilter,
      lastReviewedFilter,
      activeGameId,
    }),
    [activeGameId, lastReviewedFilter, scheduleFilter, sourceGameFilter],
  );
  const activeFilterChips = useMemo(
    () => getActiveDrillQueueFilterChips(drillQueueCardFilter, sourceGameNames),
    [drillQueueCardFilter, sourceGameNames],
  );
  const visibleCards = useMemo(
    () => filterDrillQueueCards(cards, reviewSchedule, drillQueueCardFilter),
    [cards, drillQueueCardFilter, reviewSchedule],
  );
  const visibleSelectedCardId = getVisibleScheduleSelectedCardId(visibleCards, selectedCardId);
  const selectedCard = visibleSelectedCardId
    ? cards.find((card) => card.id === visibleSelectedCardId) ?? null
    : null;
  const scheduleItemsByCardId = new Map(
    reviewSchedule?.items.map((item) => [item.cardId, item]) ?? [],
  );
  const selectedScheduleItem = selectedCard ? scheduleItemsByCardId.get(selectedCard.id) : undefined;
  const selectedAttempts = selectedCard?.attemptHistory ?? [];
  const lastAttempt = selectedAttempts.at(-1);
  const [previewPacket, setPreviewPacket] = useState<ReviewPacket | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [selectedLensId, setSelectedLensId] = useState<CoachLensId>(DEFAULT_COACH_LENS_ID);
  const [showLensComparison, setShowLensComparison] = useState(false);
  const [savedMessage, setSavedMessage] = useState<TransientMessageState>({
    message: null,
    token: 0,
  });
  const savedMessageTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectedCardGameName =
    (selectedCard ? sourceGameNames?.[selectedCard.sourceGameId] : undefined) ??
    (selectedCard?.sourceGameId === activeGameId ? activeGameName : undefined);
  const activeFilterLabels = [
    getDrillQueueScheduleFilterLabel(scheduleFilter),
    getSourceGameFilterLabel(sourceGameFilter, sourceGameNames, activeGameName),
    getLastReviewedFilterLabel(lastReviewedFilter),
  ];
  const visibleCardCountLabel = `Showing ${visibleCards.length} of ${cards.length} drill cards. Active filters: ${activeFilterLabels.join(", ")}.`;
  const coachLensInput: CoachLensInput = selectedCard
    ? {
        moveSan: selectedCard.moveSan,
        ply: selectedCard.ply,
        fenBefore: selectedCard.fenBefore,
        fenAfter: selectedCard.fenAfter,
        verdict: selectedCard.verdict,
        tags: selectedCard.tags,
        userNote: selectedCard.note,
        engineAnalysis: selectedCard.engineAnalysis,
        attempts: selectedCard.attempts,
        correct: selectedCard.correct,
        lastAttemptResult: lastAttempt?.result,
      }
    : {};

  useEffect(() => {
    if (visibleSelectedCardId && visibleSelectedCardId !== selectedCardId) {
      onSelectCard(visibleSelectedCardId);
    }
  }, [onSelectCard, selectedCardId, visibleSelectedCardId]);

  function handlePreviewPacket() {
    if (!selectedCard) {
      return;
    }

    try {
      setPreviewPacket(
        buildCardReviewPacket({
          sourceGameName: selectedCardGameName,
          card: selectedCard,
          coachLens: buildCoachLensOutput(selectedLensId, coachLensInput),
          comparedCoachLenses: showLensComparison
            ? buildCoachLensComparisonOutputs(comparisonLensIds, coachLensInput)
            : undefined,
        }),
      );
      setExportError(null);
    } catch (error) {
      setPreviewPacket(null);
      setExportError(
        error instanceof Error ? error.message : "Could not generate that review packet.",
      );
    }
  }

  function handleScheduleFilterChange(value: string) {
    const nextFilter = normalizeDrillQueueScheduleFilter(
      saveDrillQueueScheduleFilterPreference(value),
    );
    setScheduleFilter(nextFilter);
    showSavedMessage();
  }

  function handleResetFilters() {
    setScheduleFilter(
      normalizeDrillQueueScheduleFilter(saveDrillQueueScheduleFilterPreference("all")),
    );
    setSourceGameFilter(DEFAULT_DRILL_QUEUE_CARD_FILTER.sourceGameFilter);
    setLastReviewedFilter(DEFAULT_DRILL_QUEUE_CARD_FILTER.lastReviewedFilter);
    showSavedMessage();
  }

  function handleClearFilterChip(chipId: DrillQueueFilterChipId) {
    const nextFilter = clearDrillQueueFilterChip(drillQueueCardFilter, chipId);

    if (nextFilter.scheduleFilter !== scheduleFilter) {
      setScheduleFilter(
        normalizeDrillQueueScheduleFilter(
          saveDrillQueueScheduleFilterPreference(nextFilter.scheduleFilter),
        ),
      );
      showSavedMessage();
    }

    setSourceGameFilter(nextFilter.sourceGameFilter);
    setLastReviewedFilter(nextFilter.lastReviewedFilter);
  }

  function showSavedMessage() {
    setSavedMessage((currentMessage) => {
      const nextMessage = createTransientMessageState("Filter saved locally", currentMessage);

      if (savedMessageTimeoutRef.current) {
        clearTimeout(savedMessageTimeoutRef.current);
      }

      savedMessageTimeoutRef.current = setTimeout(() => {
        setSavedMessage((messageState) =>
          clearTransientMessageState(messageState, nextMessage.token),
        );
      }, 2200);

      return nextMessage;
    });
  }

  return (
    <section className="grid gap-4 border-[1.5px] border-ink bg-paper-2 p-4">
      <div>
        <h2 className="text-lg font-semibold text-ink">DrillQueue</h2>
        <p className="text-sm text-ink-muted">Review saved positions from your own games.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(180px,240px)_1fr]">
        <div className="grid content-start gap-2">
          <div className="grid gap-2">
            <label className="grid gap-1 text-sm">
              <span className="text-ink-muted">Schedule filter</span>
              <select
                className="lf-field"
                value={scheduleFilter}
                onChange={(event) => handleScheduleFilterChange(event.target.value)}
              >
                {DRILL_QUEUE_SCHEDULE_FILTERS.map((filter) => (
                  <option key={filter} value={filter}>
                    {getDrillQueueScheduleFilterLabel(filter)}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-ink-muted">Source game</span>
              <select
                className="lf-field"
                value={sourceGameFilter}
                onChange={(event) =>
                  setSourceGameFilter(event.target.value as DrillQueueSourceGameFilter)
                }
              >
                <option value="all">All games</option>
                {activeGameId ? <option value="current">Current active saved game</option> : null}
                {sourceGameOptions.map((sourceGameId) => (
                  <option key={sourceGameId} value={`game:${sourceGameId}`}>
                    {sourceGameNames?.[sourceGameId] ?? sourceGameId}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-ink-muted">Last reviewed</span>
              <select
                className="lf-field"
                value={lastReviewedFilter}
                onChange={(event) =>
                  setLastReviewedFilter(event.target.value as DrillQueueLastReviewedFilter)
                }
              >
                {DRILL_QUEUE_LAST_REVIEWED_FILTERS.map((filter) => (
                  <option key={filter} value={filter}>
                    {getLastReviewedFilterLabel(filter)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="grid gap-2 text-xs text-ink-muted">
            <div role="status" aria-live="polite" aria-label={visibleCardCountLabel}>
              Filters: {activeFilterLabels.join(" · ")} · {visibleCards.length} of {cards.length} cards
            </div>
            {activeFilterChips.length > 0 ? (
              <div className="flex flex-wrap gap-1" aria-label="Active DrillQueue filters">
                {activeFilterChips.map((chip) => (
                  <span
                    key={chip.id}
                    className="inline-flex items-center gap-1 border-[1.5px] border-ink bg-paper-3 px-2 py-1 text-[11px] text-ink-2"
                  >
                    {chip.label}
                    <button
                      className="text-ink-muted hover:text-ink"
                      type="button"
                      aria-label={chip.clearLabel}
                      onClick={() => handleClearFilterChip(chip.id)}
                    >
                      <span aria-hidden="true">x</span>
                    </button>
                  </span>
                ))}
              </div>
            ) : null}
            <button
              className="lf-button w-fit text-xs"
              type="button"
              aria-label="Reset all DrillQueue filters"
              onClick={handleResetFilters}
            >
              Reset all filters
            </button>
          </div>
          <StatusHint message={savedMessage.message} />
          <div className="max-h-80 overflow-auto border-[1.5px] border-ink">
          {cards.length === 0 ? (
            <div className="p-3 text-sm text-ink-muted">Create a mistake card to begin.</div>
          ) : visibleCards.length === 0 ? (
            <div className="p-3 text-sm text-ink-muted">
              No cards match these filters: {activeFilterLabels.join(", ")}.
            </div>
          ) : (
            visibleCards.map((card) => (
              <button
                key={card.id}
                className={`grid w-full gap-1 border-b border-ink px-3 py-2 text-left text-sm last:border-b-0 hover:bg-paper-3 ${
                  selectedCard?.id === card.id ? "bg-paper-3 text-ink" : "text-ink-2"
                }`}
                aria-label={`Select ${card.correction ? "correction" : "game-recall"} card at ply ${card.ply}, ${card.verdict}, ${card.correct} of ${card.attempts} remembered`}
                onClick={() => onSelectCard(card.id)}
              >
                <span>
                  {card.correction ? "Correction" : "Game recall"} · Ply {card.ply}: {card.verdict}
                </span>
                <span className="text-xs text-ink-muted">
                  {card.correct}/{card.attempts} remembered
                </span>
                <ScheduleBadge item={scheduleItemsByCardId.get(card.id)} compact />
              </button>
            ))
          )}
          </div>
        </div>

        {selectedCard ? (
          <div className="grid gap-3">
            <div className="grid gap-2 bg-paper-2 p-3 text-sm sm:grid-cols-3">
              <div>
                <div className="text-xs text-ink-muted">Success rate</div>
                <div className="font-semibold text-ink">
                  {getSuccessRate(selectedCard)}%
                </div>
              </div>
              <div>
                <div className="text-xs text-ink-muted">Last reviewed</div>
                <div className="text-ink-2">
                  {selectedCard.lastReviewedAt
                    ? new Date(selectedCard.lastReviewedAt).toLocaleString()
                    : "Never"}
                </div>
              </div>
              <div>
                <div className="text-xs text-ink-muted">Last result</div>
                <div className="text-ink-2">{lastAttempt?.result ?? "None"}</div>
              </div>
            </div>
            <ScheduleBadge item={selectedScheduleItem} />
            <div className="flex flex-wrap gap-2">
              <button className="lf-button" onClick={handlePreviewPacket}>
                Export card packet
              </button>
            </div>
            {exportError ? (
              <div
                className="border-[1.5px] border-spot border-l-[6px] bg-spot-tint p-3 text-sm text-ink"
                role="alert"
              >
                {exportError}
              </div>
            ) : null}
            {revealed || attemptResult ? <>
            <CoachLensPanel
              input={coachLensInput}
              selectedLensId={selectedLensId}
              onSelectLens={setSelectedLensId}
            />
            <div className="grid gap-3">
              <button
                className="lf-button w-fit"
                onClick={() => setShowLensComparison((current) => !current)}
              >
                {showLensComparison ? "Hide lens comparison" : "Compare lenses"}
              </button>
              {showLensComparison ? (
                <CoachLensComparison
                  input={coachLensInput}
                  selectedLensIds={comparisonLensIds}
                  onSelectedLensIdsChange={onComparisonLensIdsChange}
                />
              ) : null}
            </div>
            </> : null}
            <div className="max-w-sm overflow-hidden border-[1.5px] border-ink bg-paper p-2">
              <Chessboard
                options={{
                  id: `drill-${selectedCard.id}`,
                  position: selectedCard.fenBefore,
                  allowDragging: !revealed && !attemptResult,
                  boardStyle: { borderRadius: "6px" },
                  darkSquareStyle: { backgroundColor: "#6f5b43" },
                  lightSquareStyle: { backgroundColor: "#d7c7a4" },
                  onPieceDrop: ({ sourceSquare, targetSquare }) => {
                    if (!targetSquare || revealed || attemptResult) {
                      return false;
                    }

                    const result = onAttemptMove(selectedCard, sourceSquare, targetSquare);
                    return result.isMatch;
                  },
                }}
              />
            </div>
            <div
              className="bg-paper-2 p-3 text-sm text-ink-2"
              role="status"
              aria-live="polite"
            >
              {attemptResult
                ? attemptResult.isMatch
                  ? selectedCard.correction ? "Matches your saved target. Review stats updated." : "Correct. Review stats updated."
                  : `Missed. Expected ${attemptResult.expectedSan}${
                      attemptResult.attemptedSan ? `, got ${attemptResult.attemptedSan}` : ""
                    }.`
                : selectedCard.correction ? "Play your saved correction. What threat or plan does it address?" : `Game recall: find the move played on ply ${selectedCard.ply}.`}
            </div>
            {!revealed && !attemptResult ? <ReviewMoveInput key={selectedCard.id} onAttempt={san => onAttemptMove(selectedCard, san, "")} /> : null}
            {!revealed && !attemptResult ? (
              <button className="lf-button-primary" onClick={onReveal}>
                Reveal move
              </button>
            ) : (
              <div className="grid gap-3">
                <CorrectionAnswer card={selectedCard} />
                <div className="grid gap-2 bg-paper-2 p-3 text-sm">
                  <div>
                    <span className="text-ink-muted">Original move: </span>
                    <span className="font-mono text-ink">{selectedCard.moveSan}</span>
                  </div>
                  <div>
                    <span className="text-ink-muted">Verdict: </span>
                    <span>{selectedCard.verdict}</span>
                  </div>
                  <div>
                    <span className="text-ink-muted">Tags: </span>
                    <span>{selectedCard.tags.join(", ") || "none"}</span>
                  </div>
                  <div className="text-ink-2">{selectedCard.note || "No note saved."}</div>
                  {selectedCard.engineAnalysis ? (
                    <div className="grid gap-3">
                      <div>
                        <div className="text-ink-muted">{getStoredAnalysisLabel("card")}</div>
                        <div className="font-mono text-ink">
                          {selectedCard.engineAnalysis.bestMoveSan ??
                            selectedCard.engineAnalysis.bestMoveUci}{" "}
                          · {formatEvaluation(selectedCard.engineAnalysis.evaluation)}
                        </div>
                        <div className="text-xs text-ink-muted">
                          Analyzed {formatAnalysisTimestamp(selectedCard.engineAnalysis.analyzedAt)}
                        </div>
                      </div>
                      <ReviewSummary
                        heading="What to drill"
                        summary={buildExplanationSummary({
                          moveSan: selectedCard.moveSan,
                          verdict: selectedCard.verdict,
                          tags: selectedCard.tags,
                          userNote: selectedCard.note,
                          engineAnalysis: selectedCard.engineAnalysis,
                          card: {
                            ply: selectedCard.ply,
                            attempts: selectedCard.attempts,
                            correct: selectedCard.correct,
                            attemptHistory: selectedCard.attemptHistory,
                          },
                        })}
                      />
                    </div>
                  ) : null}
                </div>
                {!attemptResult ? (
                  <div className="flex flex-wrap gap-2">
                    <button
                      className="lf-button-primary"
                      onClick={() => onReview(selectedCard.id, "remembered")}
                    >
                      Remembered
                    </button>
                    <button
                      className="lf-button"
                      onClick={() => onReview(selectedCard.id, "missed")}
                    >
                      Missed
                    </button>
                  </div>
                ) : null}
              </div>
            )}
            <div hidden={!revealed && !attemptResult} className="grid gap-2 bg-paper-2 p-3 text-sm">
              <div className="text-ink-muted">Recent attempts</div>
              {selectedAttempts.length === 0 ? (
                <div className="text-ink-muted">No attempts yet.</div>
              ) : (
                [...selectedAttempts]
                  .slice(-5)
                  .reverse()
                  .map((attempt) => (
                    <div
                      key={attempt.id}
                      className="grid gap-1 border-t border-ink pt-2 first:border-t-0 first:pt-0"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span
                          className={
                            attempt.result === "remembered"
                              ? "text-data"
                              : "text-spot font-bold"
                          }
                        >
                          {attempt.result}
                        </span>
                        <span className="text-xs text-ink-muted">
                          {new Date(attempt.attemptedAt).toLocaleString()}
                        </span>
                      </div>
                      <div className="text-xs text-ink-muted">
                        {attempt.method} · expected {attempt.expectedMoveSan}
                        {attempt.attemptedMoveSan
                          ? ` · played ${attempt.attemptedMoveSan}`
                          : ""}
                      </div>
                    </div>
                  ))
              )}
            </div>
          </div>
        ) : null}
      </div>

      {previewPacket ? (
        <ReviewPacketPreviewModal
          packet={previewPacket}
          onClose={() => setPreviewPacket(null)}
        />
      ) : null}
    </section>
  );
}

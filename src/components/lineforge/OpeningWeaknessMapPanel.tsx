"use client";

import type { ReactNode } from "react";
import { useMemo, useRef, useState } from "react";
import {
  buildFilteredOpeningWeaknessMap,
  buildOpeningWeaknessReviewCardIds,
  buildOpeningWeaknessReviewCardIdsFromSignals,
  summarizeOpeningWeaknessFilter,
  type OpeningWeaknessFilter,
  type OpeningWeaknessBucket,
  type OpeningWeaknessMap,
} from "@/lib/mistake-graph/opening-weakness-map";
import {
  getDefaultOpeningWeaknessFilter,
  loadOpeningWeaknessFilterPreference,
  saveOpeningWeaknessFilterPreference,
  type OpeningWeaknessFilterPreference,
} from "@/lib/mistake-graph/opening-weakness-preferences";
import {
  MISTAKE_TAGS,
  MOVE_VERDICTS,
  type MistakeTag,
  type MoveVerdict,
} from "@/lib/move-ledger/types";
import {
  clearTransientMessageState,
  createTransientMessageState,
  type TransientMessageState,
} from "@/lib/ui/transient-message";
import { ScheduleBadge } from "./ScheduleBadge";
import { StatusHint } from "./StatusHint";
import type { ReviewScheduleSummary } from "@/lib/drill-queue/schedule";

type OpeningWeaknessMapPanelProps = {
  openingMap: OpeningWeaknessMap;
  reviewSchedule?: ReviewScheduleSummary;
  activeGameId?: string | null;
  onStartBucketReview: (bucket: OpeningWeaknessBucket) => void;
  onStartCardIdsReview: (cardIds: string[]) => void;
};

export function OpeningWeaknessMapPanel({
  openingMap,
  reviewSchedule,
  activeGameId,
  onStartBucketReview,
  onStartCardIdsReview,
}: OpeningWeaknessMapPanelProps) {
  const [selectedBucketId, setSelectedBucketId] = useState<string | null>(null);
  const [filterPreference, setFilterPreference] = useState<OpeningWeaknessFilterPreference>(() =>
    loadOpeningWeaknessFilterPreference(),
  );
  const [savedMessage, setSavedMessage] = useState<TransientMessageState>({
    message: null,
    token: 0,
  });
  const scheduleItemsByCardId = new Map(
    reviewSchedule?.items.map((item) => [item.cardId, item]) ?? [],
  );
  const savedMessageTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const filter: OpeningWeaknessFilter = useMemo(
    () => ({
      ...filterPreference,
      activeGameId,
    }),
    [filterPreference, activeGameId],
  );
  const filteredMap = useMemo(
    () => buildFilteredOpeningWeaknessMap(openingMap, filter),
    [openingMap, filter],
  );
  const filterSummary = useMemo(
    () => summarizeOpeningWeaknessFilter(openingMap, filteredMap, filter),
    [openingMap, filteredMap, filter],
  );
  const selectedBucket = useMemo(
    () =>
      filteredMap.buckets.find((bucket) => bucket.id === selectedBucketId) ??
      filteredMap.summary.strongestBucket ??
      filteredMap.buckets[0] ??
      null,
    [filteredMap, selectedBucketId],
  );

  function updateFilterPreference(nextFilter: Partial<OpeningWeaknessFilterPreference>) {
    setFilterPreference(
      saveOpeningWeaknessFilterPreference({
        ...filterPreference,
        ...nextFilter,
      }),
    );
    showSavedMessage();
  }

  function resetFilters() {
    const defaultFilter = getDefaultOpeningWeaknessFilter();
    setFilterPreference(saveOpeningWeaknessFilterPreference(defaultFilter));
    setSelectedBucketId(null);
    showSavedMessage();
  }

  function showSavedMessage() {
    setSavedMessage((currentMessage) => {
      const nextMessage = createTransientMessageState("Filters saved locally", currentMessage);

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
        <h2 className="text-lg font-semibold text-ink">Opening weakness map</h2>
        <p className="text-sm text-ink-muted">
          Local early-game patterns from mistake cards through ply {openingMap.openingPhaseMaxPly}.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Opening cards" value={filteredMap.summary.totalOpeningCards} />
        <Metric
          label="Top weakness"
          value={filteredMap.summary.strongestBucket?.label ?? "None"}
        />
        <Metric
          label="Most missed"
          value={filteredMap.summary.mostMissedBucket?.label ?? "None"}
        />
        <Metric label="Next focus" value={filteredMap.summary.recommendedNextReviewFocus} />
      </div>

      <div className="grid gap-3 bg-paper-2 p-3">
        <div className="grid gap-3 md:grid-cols-3">
          <label className="grid gap-1 text-sm">
            <span className="text-ink-muted">Review state</span>
            <select
              className="lf-field"
              value={filterPreference.reviewState}
              onChange={(event) =>
                updateFilterPreference({
                  reviewState: event.target.value as OpeningWeaknessFilter["reviewState"],
                })
              }
            >
              <option value="all">All opening cards</option>
              <option value="missed-only">Missed only</option>
              <option value="remembered-only">Remembered only</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-ink-muted">Verdict</span>
            <select
              className="lf-field"
              value={filterPreference.verdict}
              onChange={(event) =>
                updateFilterPreference({ verdict: event.target.value as MoveVerdict | "all" })
              }
            >
              <option value="all">All verdicts</option>
              {MOVE_VERDICTS.map((currentVerdict) => (
                <option key={currentVerdict} value={currentVerdict}>
                  {currentVerdict}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-ink-muted">Tag</span>
            <select
              className="lf-field"
              value={filterPreference.tag}
              onChange={(event) =>
                updateFilterPreference({ tag: event.target.value as MistakeTag | "all" })
              }
            >
              <option value="all">All tags</option>
              {MISTAKE_TAGS.map((currentTag) => (
                <option key={currentTag} value={currentTag}>
                  {currentTag}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <label className="flex items-center gap-2 text-ink-2">
            <input
              type="checkbox"
              checked={filterPreference.currentGameOnly}
              onChange={(event) =>
                updateFilterPreference({ currentGameOnly: event.target.checked })
              }
            />
            Current active saved game only
          </label>
          <div className="flex flex-wrap gap-2">
            <button className="lf-button" onClick={resetFilters}>
              Reset filters
            </button>
            <button
              className="lf-button-primary"
              disabled={filteredMap.signals.length === 0}
              onClick={() =>
                onStartCardIdsReview(buildOpeningWeaknessReviewCardIdsFromSignals(filteredMap.signals))
              }
            >
              Review visible cards
            </button>
          </div>
        </div>

        <div className="text-xs text-ink-muted">
          {filterSummary.visibleOpeningCards} visible · {filterSummary.hiddenOpeningCards} hidden ·{" "}
          filters: {filterSummary.activeFilterLabels.join(", ")} · top visible bucket:{" "}
          {filterSummary.topVisibleBucket?.label ?? "none"}
        </div>
        <StatusHint message={savedMessage.message} />
      </div>

      {filteredMap.buckets.length === 0 ? (
        <div className="bg-paper-2 p-3 text-sm text-ink-muted">
          No opening-phase mistake cards match these filters.
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(220px,320px)_1fr]">
          <div className="grid content-start gap-2">
            {filteredMap.buckets.map((bucket) => (
              <button
                key={bucket.id}
                className={`border-[1.5px] px-3 py-2 text-left text-sm ${
                  selectedBucket?.id === bucket.id
                    ? "border-dashed border-spot bg-spot-tint text-ink"
                    : "border-ink bg-paper-2 text-ink-2"
                }`}
                onClick={() => setSelectedBucketId(bucket.id)}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{bucket.label}</span>
                  <span className="font-mono text-xs">{bucket.count}</span>
                </div>
                <div className="text-xs text-ink-muted">
                  {bucket.missed} missed · {bucket.successRate}% success
                </div>
              </button>
            ))}
          </div>

          {selectedBucket ? (
            <div className="grid gap-3 bg-paper-2 p-3 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="font-medium text-ink">{selectedBucket.label}</div>
                  <div className="text-xs text-ink-muted">
                    {selectedBucket.count} cards · {selectedBucket.remembered} remembered ·{" "}
                    {selectedBucket.missed} missed
                  </div>
                </div>
                <button
                  className="lf-button-primary"
                  onClick={() => onStartBucketReview(selectedBucket)}
                >
                  Review this bucket
                </button>
              </div>

              <div className="grid gap-2 lg:grid-cols-2">
                <Detail label="Representative moves">
                  {selectedBucket.representativeMoves.length
                    ? selectedBucket.representativeMoves.join(", ")
                    : "No moves recorded."}
                </Detail>
                <Detail label="Top tags">
                  {selectedBucket.topTags.length
                    ? selectedBucket.topTags.map((item) => `${item.tag} (${item.count})`).join(", ")
                    : "No tags recorded."}
                </Detail>
              </div>

              <div className="border-[1.5px] border-ink bg-paper p-2 text-ink-2">
                <span className="text-ink-muted">Next action: </span>
                {selectedBucket.recommendedNextAction}
              </div>

              <div className="grid gap-2">
                {selectedBucket.signals.slice(0, 6).map((signal) => (
                  <div
                    key={signal.cardId}
                    className="grid gap-2 bg-paper px-3 py-2"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-ink-2">
                        Ply {signal.ply}: {signal.moveSan}
                      </span>
                      <span className="text-xs text-ink-muted">
                        {signal.verdict} · {signal.tags.join(", ") || "no tags"}
                      </span>
                    </div>
                    <ScheduleBadge item={scheduleItemsByCardId.get(signal.cardId)} compact />
                  </div>
                ))}
              </div>

              <div className="text-xs text-ink-muted">
                Review queue: {buildOpeningWeaknessReviewCardIds(selectedBucket).length} unique cards.
              </div>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="bg-paper-2 p-3">
      <div className="text-xs text-ink-muted">{label}</div>
      <div className="text-sm font-semibold text-ink">{value}</div>
    </div>
  );
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="text-ink-muted">{label}</div>
      <div className="text-ink-2">{children}</div>
    </div>
  );
}

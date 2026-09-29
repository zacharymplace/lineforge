"use client";

import { useMemo, useState } from "react";
import {
  getMissedCardIdsFromSessionSummary,
  getReviewSessionDetail,
  type ReviewSessionSummary,
} from "@/lib/drill-queue/session";
import type { MistakeCard } from "@/lib/move-ledger/types";

type ReviewSessionHistoryPanelProps = {
  summaries: ReviewSessionSummary[];
  cards: MistakeCard[];
  onReviewMissedAgain: (summary: ReviewSessionSummary) => void;
  onClearHistory: () => void;
};

export function ReviewSessionHistoryPanel({
  summaries,
  cards,
  onReviewMissedAgain,
  onClearHistory,
}: ReviewSessionHistoryPanelProps) {
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const selectedSummary =
    summaries.find((summary) => summary.id === selectedSessionId) ?? summaries[0] ?? null;
  const detail = useMemo(
    () => (selectedSummary ? getReviewSessionDetail(selectedSummary, cards) : null),
    [cards, selectedSummary],
  );

  function clearHistory() {
    if (window.confirm("Clear review-session history? Cards, games, and attempts will stay saved.")) {
      setSelectedSessionId(null);
      onClearHistory();
    }
  }

  return (
    <section className="grid gap-4 border-[1.5px] border-ink bg-paper-2 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-ink">Review session history</h2>
          <p className="text-sm text-ink-muted">
            Inspect completed sessions and repeat missed cards.
          </p>
        </div>
        <button className="lf-button" disabled={summaries.length === 0} onClick={clearHistory}>
          Clear session history
        </button>
      </div>

      {summaries.length === 0 || !detail ? (
        <div className="bg-paper-2 p-3 text-sm text-ink-muted">
          No completed review sessions yet.
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(220px,320px)_1fr]">
          <div className="grid content-start gap-2">
            {summaries.slice(0, 12).map((summary) => {
              const isSelected = summary.id === detail.summary.id;

              return (
                <button
                  key={summary.id}
                  className={`border-[1.5px] px-3 py-2 text-left text-sm ${
                    isSelected
                      ? "border-dashed border-spot bg-spot-tint text-ink"
                      : "border-ink bg-paper-2 text-ink-2"
                  }`}
                  onClick={() => setSelectedSessionId(summary.id)}
                >
                  <div className="font-medium">
                    {summary.remembered}/{summary.totalReviewed} remembered
                  </div>
                  <div className="text-xs text-ink-muted">
                    {formatDate(summary.completedAt)}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="grid gap-3">
            <div className="grid gap-3 bg-paper-2 p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-medium text-ink">
                    {detail.isMissedOnlyRepeat ? "Missed-only repeat" : "Completed session"}
                  </div>
                  <div className="text-xs text-ink-muted">{detail.filterLabel}</div>
                </div>
                {getMissedCardIdsFromSessionSummary(detail.summary).length > 0 ? (
                  <button
                    className="lf-button-primary"
                    onClick={() => onReviewMissedAgain(detail.summary)}
                  >
                    Review missed cards again
                  </button>
                ) : null}
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Metric label="Started" value={formatDate(detail.summary.startedAt)} />
                <Metric label="Completed" value={formatDate(detail.summary.completedAt)} />
                <Metric label="Size" value={String(detail.summary.sessionCardCount)} />
                <Metric label="Reviewed" value={String(detail.summary.totalReviewed)} />
                <Metric label="Remembered" value={String(detail.summary.remembered)} />
                <Metric label="Missed" value={String(detail.summary.missed)} />
                <Metric label="Skipped" value={String(detail.summary.skipped)} />
                <Metric label="Success" value={`${detail.summary.successRate}%`} />
              </div>

              <div className="grid gap-2 lg:grid-cols-2">
                <div>
                  <div className="text-ink-muted">Top missed tags</div>
                  <div className="text-ink-2">
                    {detail.summary.topMissedTags.length
                      ? detail.summary.topMissedTags
                          .map((item) => `${item.tag} (${item.count})`)
                          .join(", ")
                      : "No missed tags."}
                  </div>
                </div>
                <div>
                  <div className="text-ink-muted">Next action</div>
                  <div className="text-ink-2">{detail.summary.recommendedNextAction}</div>
                </div>
              </div>
            </div>

            <div className="grid gap-2">
              <div className="text-sm font-medium text-ink">Reviewed cards</div>
              {detail.resultDetails.length === 0 ? (
                <div className="bg-paper-2 p-3 text-sm text-ink-muted">
                  No per-card results were stored for this session.
                </div>
              ) : (
                detail.resultDetails.map((result) => (
                  <div
                    key={`${detail.summary.id}-${result.cardId}`}
                    className="grid gap-1 bg-paper-2 px-3 py-2 text-sm"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium text-ink-2">{result.label}</span>
                      <span className="border-[1.5px] border-ink px-2 py-0.5 text-xs text-ink">
                        {result.result}
                      </span>
                    </div>
                    <div className="text-xs text-ink-muted">
                      {result.verdict ?? "unknown verdict"} ·{" "}
                      {result.tags.length ? result.tags.join(", ") : "no tags"}
                    </div>
                    <div className="text-xs text-ink-muted">
                      Attempted: {result.attemptedMoveSan ?? "not recorded"} · Expected:{" "}
                      {result.expectedMoveSan ?? "unknown"}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-paper p-2">
      <div className="text-xs text-ink-muted">{label}</div>
      <div className="text-sm font-semibold text-ink">{value}</div>
    </div>
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown" : date.toLocaleString();
}


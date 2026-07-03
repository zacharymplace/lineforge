"use client";

import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import {
  buildOpeningWeaknessReviewCardIds,
  type OpeningWeaknessBucket,
  type OpeningWeaknessMap,
} from "@/lib/mistake-graph/opening-weakness-map";

type OpeningWeaknessMapPanelProps = {
  openingMap: OpeningWeaknessMap;
  onStartBucketReview: (bucket: OpeningWeaknessBucket) => void;
};

export function OpeningWeaknessMapPanel({
  openingMap,
  onStartBucketReview,
}: OpeningWeaknessMapPanelProps) {
  const [selectedBucketId, setSelectedBucketId] = useState<string | null>(null);
  const selectedBucket = useMemo(
    () =>
      openingMap.buckets.find((bucket) => bucket.id === selectedBucketId) ??
      openingMap.summary.strongestBucket ??
      openingMap.buckets[0] ??
      null,
    [openingMap, selectedBucketId],
  );

  return (
    <section className="grid gap-4 rounded-lg border border-stone-800 bg-stone-950/80 p-4">
      <div>
        <h2 className="text-lg font-semibold text-stone-100">Opening weakness map</h2>
        <p className="text-sm text-stone-500">
          Local early-game patterns from mistake cards through ply {openingMap.openingPhaseMaxPly}.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Opening cards" value={openingMap.summary.totalOpeningCards} />
        <Metric
          label="Top weakness"
          value={openingMap.summary.strongestBucket?.label ?? "None"}
        />
        <Metric
          label="Most missed"
          value={openingMap.summary.mostMissedBucket?.label ?? "None"}
        />
        <Metric label="Next focus" value={openingMap.summary.recommendedNextReviewFocus} />
      </div>

      {openingMap.buckets.length === 0 ? (
        <div className="rounded-md bg-black/30 p-3 text-sm text-stone-500">
          No opening-phase mistake cards yet.
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(220px,320px)_1fr]">
          <div className="grid content-start gap-2">
            {openingMap.buckets.map((bucket) => (
              <button
                key={bucket.id}
                className={`rounded-md border px-3 py-2 text-left text-sm ${
                  selectedBucket?.id === bucket.id
                    ? "border-amber-700 bg-amber-950/40 text-amber-100"
                    : "border-stone-800 bg-black/30 text-stone-300"
                }`}
                onClick={() => setSelectedBucketId(bucket.id)}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{bucket.label}</span>
                  <span className="font-mono text-xs">{bucket.count}</span>
                </div>
                <div className="text-xs text-stone-500">
                  {bucket.missed} missed · {bucket.successRate}% success
                </div>
              </button>
            ))}
          </div>

          {selectedBucket ? (
            <div className="grid gap-3 rounded-md bg-black/30 p-3 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="font-medium text-stone-100">{selectedBucket.label}</div>
                  <div className="text-xs text-stone-500">
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

              <div className="rounded-md border border-stone-800 bg-stone-950 p-2 text-stone-200">
                <span className="text-stone-500">Next action: </span>
                {selectedBucket.recommendedNextAction}
              </div>

              <div className="grid gap-2">
                {selectedBucket.signals.slice(0, 6).map((signal) => (
                  <div
                    key={signal.cardId}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-stone-950 px-3 py-2"
                  >
                    <span className="text-stone-200">
                      Ply {signal.ply}: {signal.moveSan}
                    </span>
                    <span className="text-xs text-stone-500">
                      {signal.verdict} · {signal.tags.join(", ") || "no tags"}
                    </span>
                  </div>
                ))}
              </div>

              <div className="text-xs text-stone-500">
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
    <div className="rounded-md bg-black/30 p-3">
      <div className="text-xs text-stone-500">{label}</div>
      <div className="text-sm font-semibold text-amber-100">{value}</div>
    </div>
  );
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="text-stone-500">{label}</div>
      <div className="text-stone-300">{children}</div>
    </div>
  );
}

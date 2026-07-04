"use client";

import type {
  OpeningWeaknessTrend,
  OpeningWeaknessTrendBucket,
} from "@/lib/mistake-graph/opening-weakness-trends";

type OpeningWeaknessTrendPanelProps = {
  trend: OpeningWeaknessTrend;
  onStartBucketReview: (bucket: OpeningWeaknessTrendBucket) => void;
};

export function OpeningWeaknessTrendPanel({
  trend,
  onStartBucketReview,
}: OpeningWeaknessTrendPanelProps) {
  const recommendedBucket =
    trend.summary.mostMissedBucket ??
    trend.summary.worseningBucket ??
    trend.summary.mostReviewedBucket ??
    null;

  return (
    <section className="grid gap-4 rounded-lg border border-stone-800 bg-stone-950/80 p-4">
      <div>
        <h2 className="text-lg font-semibold text-stone-100">Opening trend</h2>
        <p className="text-sm text-stone-500">
          Local review history grouped by date and opening weakness bucket.
        </p>
      </div>

      {trend.points.length === 0 ? (
        <div className="rounded-md bg-black/30 p-3 text-sm text-stone-500">
          Not enough opening review history yet. Review opening cards to build a trend.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Metric label="Latest success" value={`${trend.summary.latestSuccessRate}%`} />
            <Metric
              label="Most missed"
              value={trend.summary.mostMissedBucket?.bucketLabel ?? "None"}
            />
            <Metric
              label="Improving"
              value={formatBucketDelta(trend.summary.improvingBucket)}
            />
            <Metric
              label="Worsening"
              value={formatBucketDelta(trend.summary.worseningBucket)}
            />
          </div>

          <div className="grid gap-3 rounded-md bg-black/30 p-3 text-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="font-medium text-stone-100">Recommended focus</div>
                <div className="text-stone-300">{trend.summary.recommendedNextFocus}</div>
              </div>
              {recommendedBucket ? (
                <button
                  className="lf-button-primary"
                  onClick={() => onStartBucketReview(recommendedBucket)}
                >
                  Review focus bucket
                </button>
              ) : null}
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-[minmax(220px,320px)_1fr]">
            <div className="grid content-start gap-2">
              {trend.buckets.map((bucket) => (
                <div key={bucket.bucketId} className="rounded-md bg-black/30 p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-stone-100">{bucket.bucketLabel}</span>
                    <span className="font-mono text-xs text-amber-100">
                      {bucket.recentSuccessRate}%
                    </span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-stone-800">
                    <div
                      className="h-full bg-amber-500"
                      style={{ width: `${bucket.recentSuccessRate}%` }}
                    />
                  </div>
                  <div className="mt-2 text-xs text-stone-500">
                    {bucket.reviewed} reviewed · {bucket.missed} missed · delta{" "}
                    {formatDelta(bucket.successRateDelta)}
                  </div>
                </div>
              ))}
            </div>

            <div className="overflow-x-auto rounded-md bg-black/30">
              <table className="w-full min-w-[680px] text-left text-sm">
                <thead className="text-xs text-stone-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">Date</th>
                    <th className="px-3 py-2 font-medium">Bucket</th>
                    <th className="px-3 py-2 font-medium">Reviewed</th>
                    <th className="px-3 py-2 font-medium">Remembered</th>
                    <th className="px-3 py-2 font-medium">Missed</th>
                    <th className="px-3 py-2 font-medium">Skipped</th>
                    <th className="px-3 py-2 font-medium">Success</th>
                    <th className="px-3 py-2 font-medium">Top tags</th>
                  </tr>
                </thead>
                <tbody>
                  {trend.points.map((point) => (
                    <tr key={`${point.date}-${point.bucketId}`} className="border-t border-stone-800">
                      <td className="px-3 py-2 text-stone-300">{point.date}</td>
                      <td className="px-3 py-2 text-stone-200">{point.bucketLabel}</td>
                      <td className="px-3 py-2 text-stone-300">{point.reviewed}</td>
                      <td className="px-3 py-2 text-emerald-200">{point.remembered}</td>
                      <td className="px-3 py-2 text-amber-100">{point.missed}</td>
                      <td className="px-3 py-2 text-stone-400">{point.skipped}</td>
                      <td className="px-3 py-2 text-stone-300">{point.successRate}%</td>
                      <td className="px-3 py-2 text-xs text-stone-500">
                        {point.topTags.length
                          ? point.topTags.map((tag) => `${tag.tag} (${tag.count})`).join(", ")
                          : "No tags"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-black/30 p-3">
      <div className="text-xs text-stone-500">{label}</div>
      <div className="text-sm font-semibold text-amber-100">{value}</div>
    </div>
  );
}

function formatBucketDelta(bucket: OpeningWeaknessTrendBucket | undefined) {
  return bucket ? `${bucket.bucketLabel} ${formatDelta(bucket.successRateDelta)}` : "None";
}

function formatDelta(delta: number) {
  return `${delta > 0 ? "+" : ""}${delta}%`;
}


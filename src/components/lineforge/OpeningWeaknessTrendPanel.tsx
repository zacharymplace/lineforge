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
    <section className="grid gap-4 border-[1.5px] border-ink bg-paper-2 p-4">
      <div>
        <h2 className="text-lg font-semibold text-ink">Opening trend</h2>
        <p className="text-sm text-ink-muted">
          Local review history grouped by date and opening weakness bucket.
        </p>
      </div>

      {trend.points.length === 0 ? (
        <div className="bg-paper-2 p-3 text-sm text-ink-muted">
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

          <div className="grid gap-3 bg-paper-2 p-3 text-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="font-medium text-ink">Recommended focus</div>
                <div className="text-ink-2">{trend.summary.recommendedNextFocus}</div>
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
                <div key={bucket.bucketId} className="bg-paper-2 p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-ink">{bucket.bucketLabel}</span>
                    <span className="font-mono text-xs text-ink">
                      {bucket.recentSuccessRate}%
                    </span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden bg-paper-3">
                    <div
                      className="h-full bg-spot-tint"
                      style={{ width: `${bucket.recentSuccessRate}%` }}
                    />
                  </div>
                  <div className="mt-2 text-xs text-ink-muted">
                    {bucket.reviewed} reviewed · {bucket.missed} missed · delta{" "}
                    {formatDelta(bucket.successRateDelta)}
                  </div>
                </div>
              ))}
            </div>

            <div className="overflow-x-auto bg-paper-2">
              <table className="w-full min-w-[680px] text-left text-sm">
                <thead className="text-xs text-ink-muted">
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
                    <tr key={`${point.date}-${point.bucketId}`} className="border-t border-ink">
                      <td className="px-3 py-2 text-ink-2">{point.date}</td>
                      <td className="px-3 py-2 text-ink-2">{point.bucketLabel}</td>
                      <td className="px-3 py-2 text-ink-2">{point.reviewed}</td>
                      <td className="px-3 py-2 text-data">{point.remembered}</td>
                      <td className="px-3 py-2 text-ink">{point.missed}</td>
                      <td className="px-3 py-2 text-ink-muted">{point.skipped}</td>
                      <td className="px-3 py-2 text-ink-2">{point.successRate}%</td>
                      <td className="px-3 py-2 text-xs text-ink-muted">
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
    <div className="bg-paper-2 p-3">
      <div className="text-xs text-ink-muted">{label}</div>
      <div className="text-sm font-semibold text-ink">{value}</div>
    </div>
  );
}

function formatBucketDelta(bucket: OpeningWeaknessTrendBucket | undefined) {
  return bucket ? `${bucket.bucketLabel} ${formatDelta(bucket.successRateDelta)}` : "None";
}

function formatDelta(delta: number) {
  return `${delta > 0 ? "+" : ""}${delta}%`;
}


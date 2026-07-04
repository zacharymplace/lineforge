"use client";

import {
  buildDueReviewCardIds,
  type ReviewScheduleSummary,
} from "@/lib/drill-queue/schedule";
import { ScheduleBadge } from "./ScheduleBadge";

type ReviewSchedulePanelProps = {
  schedule: ReviewScheduleSummary;
  onStartDueReview: (cardIds: string[]) => void;
};

export function ReviewSchedulePanel({
  schedule,
  onStartDueReview,
}: ReviewSchedulePanelProps) {
  const dueCardIds = buildDueReviewCardIds(schedule);

  return (
    <section className="grid gap-3 rounded-lg border border-stone-800 bg-stone-950/80 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-stone-100">Review schedule</h2>
          <p className="text-sm text-stone-500">
            Local due cards from your attempts and session history.
          </p>
        </div>
        <button
          className="lf-button-primary"
          disabled={dueCardIds.length === 0}
          onClick={() => onStartDueReview(dueCardIds)}
        >
          Start due review
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label="Due now" value={schedule.dueNowCount} />
        <Metric label="Due soon" value={schedule.dueSoonCount} />
        <Metric label="Stable" value={schedule.stableCount} />
        <Metric label="New" value={schedule.newCount} />
      </div>

      <div className="rounded-md border border-stone-800 bg-black/30 p-3 text-sm text-stone-200">
        <span className="text-stone-500">Next action: </span>
        {schedule.recommendedNextAction}
      </div>

      <div className="grid gap-2">
        <div className="text-sm font-medium text-stone-100">Top priority cards</div>
        {schedule.topPriorityItems.length === 0 ? (
          <div className="text-sm text-stone-500">No mistake cards are scheduled yet.</div>
        ) : (
          schedule.topPriorityItems.map((item) => (
            <div
              key={item.cardId}
              className="grid gap-2 rounded-md bg-black/30 px-3 py-2 text-sm sm:grid-cols-[1fr_auto]"
            >
              <div>
                <div className="font-mono text-amber-100">
                  Ply {item.ply}: {item.moveSan}
                </div>
                <div className="text-xs text-stone-500">
                  {item.verdict} · {item.tags.join(", ") || "no tags"}
                </div>
                <div className="mt-1 text-xs text-stone-400">
                  {item.reasons.slice(0, 2).map((reason) => reason.label).join(" · ") ||
                    "No urgent scheduling reason."}
                </div>
              </div>
              <div className="flex flex-wrap items-start gap-2 sm:justify-end">
                <ScheduleBadge item={item} compact />
                <span className="rounded-md bg-stone-950 px-2 py-1 font-mono text-xs text-amber-100">
                  {item.priorityScore}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-black/30 p-3">
      <div className="text-xs text-stone-500">{label}</div>
      <div className="text-2xl font-semibold text-amber-100">{value}</div>
    </div>
  );
}

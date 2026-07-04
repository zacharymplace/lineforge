"use client";

import {
  formatReviewScheduleLastReviewed,
  getReviewScheduleBadgeText,
  getReviewScheduleCardAction,
  getReviewSchedulePriorityLabel,
  type ReviewScheduleItem,
} from "@/lib/drill-queue/schedule";

type ScheduleBadgeProps = {
  item?: ReviewScheduleItem;
  compact?: boolean;
};

export function ScheduleBadge({ item, compact = false }: ScheduleBadgeProps) {
  if (!item) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      <span className="rounded-md border border-stone-700 bg-stone-950 px-2 py-1 text-stone-200">
        {getReviewScheduleBadgeText(item)}
      </span>
      <span className="rounded-md bg-black/30 px-2 py-1 text-amber-100">
        {getReviewSchedulePriorityLabel(item)}
      </span>
      {!compact ? (
        <>
          <span className="rounded-md bg-black/30 px-2 py-1 text-stone-400">
            {item.successRate}% success
          </span>
          <span className="rounded-md bg-black/30 px-2 py-1 text-stone-400">
            {formatReviewScheduleLastReviewed(item)}
          </span>
        </>
      ) : null}
      <span className="text-stone-500">{getReviewScheduleCardAction(item)}</span>
    </div>
  );
}

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

  const scheduleSummary = [
    `Schedule status ${getReviewScheduleBadgeText(item)}`,
    getReviewSchedulePriorityLabel(item),
    `${item.successRate}% success`,
    formatReviewScheduleLastReviewed(item),
    getReviewScheduleCardAction(item),
  ].join(", ");

  return (
    <div
      className="flex flex-wrap items-center gap-1.5 text-xs"
      role="group"
      aria-label={scheduleSummary}
    >
      <span className="border-[1.5px] border-ink bg-paper px-2 py-1 text-ink-2">
        {getReviewScheduleBadgeText(item)}
      </span>
      <span className="bg-paper-2 px-2 py-1 text-ink">
        {getReviewSchedulePriorityLabel(item)}
      </span>
      {!compact ? (
        <>
          <span className="bg-paper-2 px-2 py-1 text-ink-muted">
            {item.successRate}% success
          </span>
          <span className="bg-paper-2 px-2 py-1 text-ink-muted">
            {formatReviewScheduleLastReviewed(item)}
          </span>
        </>
      ) : null}
      <span className="text-ink-muted">{getReviewScheduleCardAction(item)}</span>
    </div>
  );
}

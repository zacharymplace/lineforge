import {
  REVIEW_SCHEDULE_FILTERS,
  type ReviewScheduleFilter,
} from "@/lib/drill-queue/schedule";

const DRILL_QUEUE_SCHEDULE_FILTER_PREFERENCE_KEY =
  "lineforge.drillQueue.scheduleFilter.v1";
const DEFAULT_DRILL_QUEUE_SCHEDULE_FILTER: ReviewScheduleFilter = "all";

type StorageLike = Pick<Storage, "getItem" | "setItem">;

export function isValidDrillQueueScheduleFilter(
  value: unknown,
): value is ReviewScheduleFilter {
  return REVIEW_SCHEDULE_FILTERS.includes(value as ReviewScheduleFilter);
}

export function normalizeDrillQueueScheduleFilter(
  value: unknown,
): ReviewScheduleFilter {
  return isValidDrillQueueScheduleFilter(value)
    ? value
    : DEFAULT_DRILL_QUEUE_SCHEDULE_FILTER;
}

export function loadDrillQueueScheduleFilterPreference(
  storage?: StorageLike | null,
) {
  const source = storage ?? (typeof window !== "undefined" ? window.localStorage : null);

  if (!source) {
    return DEFAULT_DRILL_QUEUE_SCHEDULE_FILTER;
  }

  return normalizeDrillQueueScheduleFilter(
    source.getItem(DRILL_QUEUE_SCHEDULE_FILTER_PREFERENCE_KEY),
  );
}

export function saveDrillQueueScheduleFilterPreference(
  filter: unknown,
  storage?: StorageLike | null,
) {
  const source = storage ?? (typeof window !== "undefined" ? window.localStorage : null);
  const normalized = normalizeDrillQueueScheduleFilter(filter);

  source?.setItem(DRILL_QUEUE_SCHEDULE_FILTER_PREFERENCE_KEY, normalized);
  return normalized;
}

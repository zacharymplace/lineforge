import {
  REVIEW_SESSION_SIZE_OPTIONS,
  type ReviewSessionSize,
} from "@/lib/drill-queue/session";

const REVIEW_SESSION_SIZE_PREFERENCE_KEY = "lineforge.drillQueue.sessionSize.v1";
const DEFAULT_REVIEW_SESSION_SIZE: ReviewSessionSize = 10;

type StorageLike = Pick<Storage, "getItem" | "setItem">;

export function isValidReviewSessionSize(value: unknown): value is ReviewSessionSize {
  return REVIEW_SESSION_SIZE_OPTIONS.includes(value as ReviewSessionSize);
}

export function normalizeReviewSessionSize(value: unknown): ReviewSessionSize {
  if (value === "all") {
    return "all";
  }

  const numericValue = typeof value === "number" ? value : Number(value);

  return isValidReviewSessionSize(numericValue)
    ? numericValue
    : DEFAULT_REVIEW_SESSION_SIZE;
}

export function loadReviewSessionSizePreference(storage?: StorageLike | null) {
  const source = storage ?? (typeof window !== "undefined" ? window.localStorage : null);

  if (!source) {
    return DEFAULT_REVIEW_SESSION_SIZE;
  }

  return normalizeReviewSessionSize(source.getItem(REVIEW_SESSION_SIZE_PREFERENCE_KEY));
}

export function saveReviewSessionSizePreference(
  size: unknown,
  storage?: StorageLike | null,
) {
  const source = storage ?? (typeof window !== "undefined" ? window.localStorage : null);
  const normalized = normalizeReviewSessionSize(size);

  source?.setItem(REVIEW_SESSION_SIZE_PREFERENCE_KEY, String(normalized));
  return normalized;
}


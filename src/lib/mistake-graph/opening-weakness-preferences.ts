import type { OpeningWeaknessFilter } from "./opening-weakness-map";
import { MISTAKE_TAGS, MOVE_VERDICTS, type MistakeTag, type MoveVerdict } from "@/lib/move-ledger/types";

const OPENING_WEAKNESS_FILTER_PREFERENCE_KEY = "lineforge.mistakeGraph.openingWeaknessFilters.v1";

export type OpeningWeaknessFilterPreference = Pick<
  OpeningWeaknessFilter,
  "reviewState" | "currentGameOnly" | "verdict" | "tag"
>;

type StorageLike = Pick<Storage, "getItem" | "setItem">;

const REVIEW_STATES = ["all", "missed-only", "remembered-only"] as const;

export function getDefaultOpeningWeaknessFilter(): OpeningWeaknessFilterPreference {
  return {
    reviewState: "all",
    currentGameOnly: false,
    verdict: "all",
    tag: "all",
  };
}

export function normalizeOpeningWeaknessFilterPreference(
  value: unknown,
): OpeningWeaknessFilterPreference {
  if (!value || typeof value !== "object") {
    return getDefaultOpeningWeaknessFilter();
  }

  const candidate = value as Partial<OpeningWeaknessFilterPreference>;

  return {
    reviewState: isValidReviewState(candidate.reviewState) ? candidate.reviewState : "all",
    currentGameOnly: typeof candidate.currentGameOnly === "boolean" ? candidate.currentGameOnly : false,
    verdict: isValidVerdictPreference(candidate.verdict) ? candidate.verdict : "all",
    tag: isValidTagPreference(candidate.tag) ? candidate.tag : "all",
  };
}

export function loadOpeningWeaknessFilterPreference(storage?: StorageLike | null) {
  const source = storage ?? (typeof window !== "undefined" ? window.localStorage : null);

  if (!source) {
    return getDefaultOpeningWeaknessFilter();
  }

  try {
    return normalizeOpeningWeaknessFilterPreference(
      JSON.parse(source.getItem(OPENING_WEAKNESS_FILTER_PREFERENCE_KEY) ?? "null"),
    );
  } catch {
    return getDefaultOpeningWeaknessFilter();
  }
}

export function saveOpeningWeaknessFilterPreference(
  filter: Partial<OpeningWeaknessFilterPreference>,
  storage?: StorageLike | null,
) {
  const source = storage ?? (typeof window !== "undefined" ? window.localStorage : null);
  const normalized = normalizeOpeningWeaknessFilterPreference(filter);

  source?.setItem(OPENING_WEAKNESS_FILTER_PREFERENCE_KEY, JSON.stringify(normalized));
  return normalized;
}

function isValidReviewState(
  value: unknown,
): value is OpeningWeaknessFilterPreference["reviewState"] {
  return typeof value === "string" && REVIEW_STATES.includes(value as OpeningWeaknessFilterPreference["reviewState"]);
}

function isValidVerdictPreference(value: unknown): value is MoveVerdict | "all" {
  return value === "all" || MOVE_VERDICTS.includes(value as MoveVerdict);
}

function isValidTagPreference(value: unknown): value is MistakeTag | "all" {
  return value === "all" || MISTAKE_TAGS.includes(value as MistakeTag);
}


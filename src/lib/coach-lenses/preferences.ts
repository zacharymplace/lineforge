import {
  DEFAULT_COACH_LENS_COMPARISON_IDS,
  MAX_COACH_LENS_COMPARISON,
} from "./lenses";
import { COACH_LENS_IDS, type CoachLensId } from "./types";

const COMPARISON_LENS_PREFERENCE_KEY = "lineforge.coachLenses.comparison.v1";

type StorageLike = Pick<Storage, "getItem" | "setItem">;

export function isValidCoachLensId(value: unknown): value is CoachLensId {
  return typeof value === "string" && COACH_LENS_IDS.includes(value as CoachLensId);
}

export function normalizeComparisonLensSelection(value: unknown): CoachLensId[] {
  if (!Array.isArray(value)) {
    return DEFAULT_COACH_LENS_COMPARISON_IDS;
  }

  const normalized: CoachLensId[] = [];

  for (const lensId of value) {
    if (isValidCoachLensId(lensId) && !normalized.includes(lensId)) {
      normalized.push(lensId);
    }
  }

  return normalized.length
    ? normalized.slice(0, MAX_COACH_LENS_COMPARISON)
    : DEFAULT_COACH_LENS_COMPARISON_IDS;
}

export function loadComparisonLensPreference(storage?: StorageLike | null) {
  const source = storage ?? (typeof window !== "undefined" ? window.localStorage : null);

  if (!source) {
    return DEFAULT_COACH_LENS_COMPARISON_IDS;
  }

  try {
    return normalizeComparisonLensSelection(
      JSON.parse(source.getItem(COMPARISON_LENS_PREFERENCE_KEY) ?? "null"),
    );
  } catch {
    return DEFAULT_COACH_LENS_COMPARISON_IDS;
  }
}

export function saveComparisonLensPreference(
  lensIds: CoachLensId[],
  storage?: StorageLike | null,
) {
  const source = storage ?? (typeof window !== "undefined" ? window.localStorage : null);
  const normalized = normalizeComparisonLensSelection(lensIds);

  source?.setItem(COMPARISON_LENS_PREFERENCE_KEY, JSON.stringify(normalized));
  return normalized;
}


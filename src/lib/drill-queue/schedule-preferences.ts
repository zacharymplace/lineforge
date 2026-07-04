export const REVIEW_SCHEDULE_INTERVAL_PRESETS = [
  "gentle",
  "standard",
  "intense",
] as const;

export type ReviewScheduleIntervalPreset =
  (typeof REVIEW_SCHEDULE_INTERVAL_PRESETS)[number];

export type ReviewSchedulePreferences = {
  preset: ReviewScheduleIntervalPreset;
  missedLastAttemptStatus: "due-now" | "due-soon";
  skippedRecentlyStatus: "due-now" | "due-soon" | "stable";
  lowSuccessStatus: "due-soon" | "stable";
  staleCardStatus: "due-soon" | "stable";
  rememberedStableDays: number;
  skippedRecentDays: number;
  staleDays: number;
  lowSuccessThreshold: number;
};

export type ReviewSchedulePreferenceValidationResult = {
  preferences: ReviewSchedulePreferences;
  repaired: boolean;
};

const REVIEW_SCHEDULE_PREFERENCE_KEY = "lineforge.drillQueue.schedulePreferences.v1";

const STANDARD_REVIEW_SCHEDULE_PREFERENCES: ReviewSchedulePreferences = {
  preset: "standard",
  missedLastAttemptStatus: "due-now",
  skippedRecentlyStatus: "due-soon",
  lowSuccessStatus: "due-soon",
  staleCardStatus: "stable",
  rememberedStableDays: 3,
  skippedRecentDays: 14,
  staleDays: 7,
  lowSuccessThreshold: 50,
};

const REVIEW_SCHEDULE_PRESET_VALUES: Record<
  ReviewScheduleIntervalPreset,
  ReviewSchedulePreferences
> = {
  gentle: {
    preset: "gentle",
    missedLastAttemptStatus: "due-soon",
    skippedRecentlyStatus: "due-soon",
    lowSuccessStatus: "stable",
    staleCardStatus: "stable",
    rememberedStableDays: 5,
    skippedRecentDays: 10,
    staleDays: 14,
    lowSuccessThreshold: 35,
  },
  standard: STANDARD_REVIEW_SCHEDULE_PREFERENCES,
  intense: {
    preset: "intense",
    missedLastAttemptStatus: "due-now",
    skippedRecentlyStatus: "due-now",
    lowSuccessStatus: "due-soon",
    staleCardStatus: "due-soon",
    rememberedStableDays: 1,
    skippedRecentDays: 21,
    staleDays: 3,
    lowSuccessThreshold: 70,
  },
};

type StorageLike = Pick<Storage, "getItem" | "setItem">;

export function getDefaultReviewSchedulePreferences() {
  return { ...STANDARD_REVIEW_SCHEDULE_PREFERENCES };
}

export function isValidReviewScheduleIntervalPreset(
  value: unknown,
): value is ReviewScheduleIntervalPreset {
  return REVIEW_SCHEDULE_INTERVAL_PRESETS.includes(
    value as ReviewScheduleIntervalPreset,
  );
}

export function getReviewSchedulePresetPreferences(
  preset: ReviewScheduleIntervalPreset,
) {
  return { ...REVIEW_SCHEDULE_PRESET_VALUES[preset] };
}

export function normalizeReviewSchedulePreferences(
  value: unknown,
): ReviewSchedulePreferences {
  return validateReviewSchedulePreferences(value).preferences;
}

export function validateReviewSchedulePreferences(
  value: unknown,
): ReviewSchedulePreferenceValidationResult {
  if (isValidReviewScheduleIntervalPreset(value)) {
    return {
      preferences: getReviewSchedulePresetPreferences(value),
      repaired: false,
    };
  }

  if (!value || typeof value !== "object") {
    return {
      preferences: getDefaultReviewSchedulePreferences(),
      repaired: true,
    };
  }

  const preset = (value as { preset?: unknown }).preset;
  if (!isValidReviewScheduleIntervalPreset(preset)) {
    return {
      preferences: getDefaultReviewSchedulePreferences(),
      repaired: true,
    };
  }

  return {
    preferences: getReviewSchedulePresetPreferences(preset),
    repaired: false,
  };
}

export function loadReviewSchedulePreferences(storage?: StorageLike | null) {
  const source = storage ?? (typeof window !== "undefined" ? window.localStorage : null);

  if (!source) {
    return getDefaultReviewSchedulePreferences();
  }

  try {
    return normalizeReviewSchedulePreferences(
      JSON.parse(source.getItem(REVIEW_SCHEDULE_PREFERENCE_KEY) ?? "null"),
    );
  } catch {
    return getDefaultReviewSchedulePreferences();
  }
}

export function saveReviewSchedulePreferences(
  value: unknown,
  storage?: StorageLike | null,
) {
  const source = storage ?? (typeof window !== "undefined" ? window.localStorage : null);
  const preferences = normalizeReviewSchedulePreferences(value);

  source?.setItem(REVIEW_SCHEDULE_PREFERENCE_KEY, JSON.stringify(preferences));
  return preferences;
}

export function resetReviewSchedulePreferences(storage?: StorageLike | null) {
  return saveReviewSchedulePreferences(getDefaultReviewSchedulePreferences(), storage);
}

export function getReviewSchedulePresetLabel(preset: ReviewScheduleIntervalPreset) {
  if (preset === "gentle") return "Gentle";
  if (preset === "intense") return "Intense";
  return "Standard";
}

export function getReviewSchedulePresetDescription(
  preferences: ReviewSchedulePreferences,
) {
  if (preferences.preset === "gentle") {
    return "Fewer urgent cards, a longer stable window, and a softer low-success threshold.";
  }

  if (preferences.preset === "intense") {
    return "More aggressive due status for skipped, stale, and lower-success cards.";
  }

  return "Matches LineForge's default local scheduling cadence.";
}

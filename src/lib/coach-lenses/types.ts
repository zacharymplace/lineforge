import type { EngineAnalysisResult } from "@/lib/engine/types";
import type { DrillAttempt, MistakeTag, MoveVerdict } from "@/lib/move-ledger/types";

export const COACH_LENS_IDS = [
  "blunder-audit",
  "tactics",
  "king-safety",
  "trade-check",
  "opening-minimalist",
  "plan-mismatch",
] as const;

export type CoachLensId = (typeof COACH_LENS_IDS)[number];

export type CoachLensConfidence = "low" | "medium" | "high";

export type CoachLens = {
  id: CoachLensId;
  label: string;
  description: string;
};

export type CoachLensPoint = {
  id: string;
  text: string;
};

export type CoachLensInput = {
  moveSan?: string;
  ply?: number;
  fenBefore?: string;
  fenAfter?: string;
  verdict?: MoveVerdict;
  tags?: MistakeTag[];
  userNote?: string;
  engineAnalysis?: EngineAnalysisResult;
  attempts?: number;
  correct?: number;
  lastAttemptResult?: "remembered" | "missed";
};

export type CoachLensOutput = {
  lensId: CoachLensId;
  title: string;
  summary: string;
  points: CoachLensPoint[];
  recommendedNextAction: string;
  confidence: CoachLensConfidence;
};

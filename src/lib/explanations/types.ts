import type { EngineAnalysisResult } from "@/lib/engine/types";
import type { DrillAttempt, MistakeTag, MoveVerdict } from "@/lib/move-ledger/types";

export type ExplanationSeverity = "info" | "positive" | "warning" | "critical";

export type ExplanationPoint = {
  id: string;
  severity: ExplanationSeverity;
  text: string;
};

export type ExplanationInput = {
  moveSan?: string;
  verdict?: MoveVerdict;
  tags?: MistakeTag[];
  userNote?: string;
  engineAnalysis?: EngineAnalysisResult;
  card?: {
    ply: number;
    attempts: number;
    correct: number;
    attemptHistory: DrillAttempt[];
  };
};

export type ExplanationSummary = {
  title: string;
  points: ExplanationPoint[];
  recommendation?: string;
};

import type { EngineAnalysisResult } from "@/lib/engine/types";
import type { CoachLensOutput } from "@/lib/coach-lenses/types";
import type { ExplanationSummary } from "@/lib/explanations/types";
import type {
  DrillAttempt,
  MistakeCard,
  MistakeTag,
  MoveAnnotation,
  MoveVerdict,
} from "@/lib/move-ledger/types";

export const LINEFORGE_REVIEW_PACKET_VERSION = 1 as const;

export type ReviewPacketSourceType = "move" | "card";

export type ReviewPacketStats = {
  attempts: number;
  correct: number;
  lastReviewedAt?: string;
};

export type ReviewPacket = {
  id: string;
  lineforgeReviewPacketVersion: typeof LINEFORGE_REVIEW_PACKET_VERSION;
  sourceType: ReviewPacketSourceType;
  correction?: MistakeCard["correction"];
  sourceGameId?: string;
  sourceGameName?: string;
  ply?: number;
  fenBefore?: string;
  fenAfter?: string;
  moveSan?: string;
  userNote?: string;
  verdict?: MoveVerdict;
  tags: MistakeTag[];
  engineAnalysis?: EngineAnalysisResult;
  reviewSummary: ExplanationSummary;
  coachLens?: CoachLensOutput;
  comparedCoachLenses?: CoachLensOutput[];
  drillRecommendation?: string;
  reviewStats?: ReviewPacketStats;
  recentAttempts?: DrillAttempt[];
  createdAt: string;
};

export type MoveReviewPacketInput = {
  sourceGameId?: string;
  sourceGameName?: string;
  ply: number;
  fenBefore?: string;
  fenAfter?: string;
  moveSan?: string;
  annotation?: MoveAnnotation;
  coachLens?: CoachLensOutput;
  comparedCoachLenses?: CoachLensOutput[];
};

export type CardReviewPacketInput = {
  sourceGameName?: string;
  card: MistakeCard;
  coachLens?: CoachLensOutput;
  comparedCoachLenses?: CoachLensOutput[];
};

import type { Move } from "chess.js";

export const MOVE_VERDICTS = ["good", "mistake", "blunder", "unclear"] as const;

export type MoveVerdict = (typeof MOVE_VERDICTS)[number];

export const MISTAKE_TAGS = [
  "missed tactic",
  "hung piece",
  "bad trade",
  "king safety",
  "opening confusion",
  "endgame technique",
  "time pressure",
  "plan mismatch",
] as const;

export type MistakeTag = (typeof MISTAKE_TAGS)[number];

export type MoveAnnotation = {
  ply: number;
  thought: string;
  verdict: MoveVerdict;
  tags: MistakeTag[];
  updatedAt: string;
};

export type LineForgeMove = Pick<
  Move,
  "from" | "to" | "san" | "before" | "after" | "color" | "piece"
> & {
  ply: number;
};

export type LineForgeGame = {
  id: string;
  name: string;
  pgn: string;
  initialFen?: string;
  fen: string;
  moves: LineForgeMove[];
  annotations: Record<number, MoveAnnotation>;
  importedAt: string;
  createdAt: string;
  updatedAt: string;
};

export type SavedGameSummary = {
  id: string;
  name: string;
  importedAt: string;
  updatedAt: string;
  moveCount: number;
};

export type MoveLedgerLibrary = {
  savedGames: LineForgeGame[];
  activeGameId: string | null;
};

export type MistakeCard = {
  id: string;
  sourceGameId: string;
  ply: number;
  fenBefore: string;
  fenAfter: string;
  moveSan: string;
  prompt: string;
  note: string;
  tags: MistakeTag[];
  verdict: MoveVerdict;
  createdAt: string;
  attempts: number;
  correct: number;
  lastReviewedAt?: string;
  attemptHistory: DrillAttempt[];
};

export type ReviewResult = "remembered" | "missed";

export type DrillAttemptMethod = "played" | "manual-reveal";

export type DrillAttempt = {
  id: string;
  attemptedAt: string;
  attemptedMoveSan?: string;
  attemptedFenAfter?: string;
  expectedMoveSan: string;
  result: ReviewResult;
  method: DrillAttemptMethod;
};

export type DrillAttemptResult = {
  reviewResult: ReviewResult;
  attemptedSan: string | null;
  attemptedFenAfter: string | null;
  expectedSan: string;
  isMatch: boolean;
};

export type MistakeStats = {
  totalCards: number;
  byVerdict: Record<MoveVerdict, number>;
  topTags: Array<{ tag: MistakeTag; count: number }>;
  recentCards: MistakeCard[];
};

export type LineForgeBackup = {
  lineforgeBackupVersion: 1;
  exportedAt: string;
  savedGames: LineForgeGame[];
  activeGameId: string | null;
  mistakeCards: MistakeCard[];
};

export type PgnImportMetadata = {
  white: string;
  black: string;
  event: string;
  site: string;
  date: string;
  result: string;
};

export type PgnImportPreview = {
  pgn: string;
  metadata: PgnImportMetadata;
  suggestedName: string;
  moveCount: number;
  finalFen: string;
  validationStatus: "valid";
  hasUnsavedWarning: boolean;
  warning?: string;
};

export type PgnImportResult =
  | {
      ok: true;
      preview: PgnImportPreview;
    }
  | {
      ok: false;
      error: string;
    };

import { isValidCorrection } from "../mistake-graph/correction";
import { Chess, validateFen } from "chess.js";
import { MISTAKE_TAGS, MOVE_VERDICTS } from "./types";
import type {
  DrillAttempt,
  LineForgeBackup,
  LineForgeGame,
  LineForgeMove,
  MistakeCard,
  MoveLedgerLibrary,
} from "./types";

export function createBackup(
  library: MoveLedgerLibrary,
  mistakeCards: MistakeCard[],
  sessionSummaries: import("../drill-queue/session").ReviewSessionSummary[] = [],
): LineForgeBackup {
  return {
    lineforgeBackupVersion: 1,
    exportedAt: new Date().toISOString(),
    savedGames: library.savedGames,
    activeGameId: library.activeGameId,
    mistakeCards,
    sessionSummaries,
  };
}

export function serializeBackup(backup: LineForgeBackup) {
  return JSON.stringify(backup, null, 2);
}

export function parseBackupJson(json: string): LineForgeBackup {
  const parsed: unknown = JSON.parse(json);

  if (!isBackup(parsed)) {
    throw new Error("That file is not a valid LineForge backup.");
  }

  return parsed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isValidFen(fen: unknown) {
  if (!isString(fen)) {
    return false;
  }

  try {
    return validateFen(fen).ok;
  } catch {
    return false;
  }
}

function isValidPgn(pgn: unknown) {
  if (!isString(pgn)) {
    return false;
  }

  if (!pgn.trim()) {
    return true;
  }

  try {
    const chess = new Chess();
    chess.loadPgn(pgn, { strict: false });
    return true;
  } catch {
    return false;
  }
}

function isAnnotationRecord(value: unknown) {
  if (!isRecord(value)) {
    return false;
  }

  return Object.values(value).every(
    (annotation) =>
      isRecord(annotation) &&
      typeof annotation.ply === "number" &&
      isString(annotation.thought) &&
      MOVE_VERDICTS.includes(annotation.verdict as never) &&
      Array.isArray(annotation.tags) &&
      annotation.tags.every((tag) => MISTAKE_TAGS.includes(tag as never)) &&
      isString(annotation.updatedAt),
  );
}

function isMove(value: unknown): value is LineForgeMove {
  return (
    isRecord(value) &&
    typeof value.ply === "number" &&
    isString(value.from) &&
    isString(value.to) &&
    isString(value.san) &&
    isValidFen(value.before) &&
    isValidFen(value.after) &&
    isString(value.color) &&
    isString(value.piece)
  );
}

function isGame(value: unknown): value is LineForgeGame {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.name) &&
    isValidPgn(value.pgn) &&
    (value.initialFen === undefined || isValidFen(value.initialFen)) &&
    isValidFen(value.fen) &&
    Array.isArray(value.moves) &&
    value.moves.every(isMove) &&
    isAnnotationRecord(value.annotations) &&
    isString(value.importedAt) &&
    isString(value.createdAt) &&
    isString(value.updatedAt)
  );
}

function isDrillAttempt(value: unknown): value is DrillAttempt {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.attemptedAt) &&
    (value.attemptedMoveSan === undefined || isString(value.attemptedMoveSan)) &&
    (value.attemptedFenAfter === undefined || isValidFen(value.attemptedFenAfter)) &&
    isString(value.expectedMoveSan) &&
    (value.result === "remembered" || value.result === "missed") &&
    (value.method === "played" || value.method === "manual-reveal")
  );
}

function isCard(value: unknown): value is MistakeCard {
  if (!isRecord(value)) {
    return false;
  }

  const attemptHistory = value.attemptHistory;
  const hasValidAttemptHistory =
    Array.isArray(attemptHistory) && attemptHistory.every(isDrillAttempt);
  const correctAttempts = hasValidAttemptHistory
    ? attemptHistory.filter((attempt) => attempt.result === "remembered").length
    : 0;
  const attempts = value.attempts;
  const correct = value.correct;

  return (
    isString(value.id) &&
    isString(value.sourceGameId) &&
    typeof value.ply === "number" &&
    isValidFen(value.fenBefore) &&
    isValidFen(value.fenAfter) &&
    isString(value.moveSan) &&
    (value.correction === undefined || isValidCorrection(value.correction, { fenBefore: value.fenBefore as string, moveSan: value.moveSan as string })) &&
    isString(value.prompt) &&
    isString(value.note) &&
    Array.isArray(value.tags) &&
    value.tags.every((tag) => MISTAKE_TAGS.includes(tag as never)) &&
    MOVE_VERDICTS.includes(value.verdict as never) &&
    isString(value.createdAt) &&
    typeof attempts === "number" &&
    Number.isInteger(attempts) &&
    attempts >= 0 &&
    typeof correct === "number" &&
    Number.isInteger(correct) &&
    correct >= 0 &&
    correct <= attempts &&
    (value.lastReviewedAt === undefined || isString(value.lastReviewedAt)) &&
    hasValidAttemptHistory &&
    attempts === attemptHistory.length &&
    correct === correctAttempts
  );
}

function isBackup(value: unknown): value is LineForgeBackup {
  if (
    !isRecord(value) ||
    value.lineforgeBackupVersion !== 1 ||
    !isString(value.exportedAt) ||
    !Array.isArray(value.savedGames) ||
    !value.savedGames.every(isGame) ||
    !(value.activeGameId === null || isString(value.activeGameId)) ||
    !Array.isArray(value.mistakeCards) ||
    !value.mistakeCards.every(isCard) ||
    (value.sessionSummaries !== undefined &&
      (!Array.isArray(value.sessionSummaries) || !value.sessionSummaries.every(isSessionSummary)))
  ) {
    return false;
  }

  return (
    value.activeGameId === null ||
    value.savedGames.some((game) => game.id === value.activeGameId)
  );
}

// Validate imported history before any replacement. Historical card IDs may no
// longer exist, so retain them rather than fabricating or discarding results.
function isSessionSummary(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const count = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n) && n >= 0;
  const date = (d: unknown): d is string => isString(d) && Number.isFinite(Date.parse(d));
  const ids = (a: unknown): a is string[] => Array.isArray(a) && a.every(isString) && new Set(a).size === a.length;
  const filter = value.filter;
  if (!isRecord(filter)) return false;
  const validFilter = ["all", "missed-recently", "lowest-success-rate", "most-recent", "due-review"].includes(filter.type as string) ||
    (filter.type === "verdict" && MOVE_VERDICTS.includes(filter.verdict as never)) ||
    (filter.type === "tag" && MISTAKE_TAGS.includes(filter.tag as never)) ||
    (filter.type === "missed-only-repeat" && isString(filter.sourceSessionId)) ||
    (filter.type === "opening-weakness" && isString(filter.bucketId));
  if (!validFilter || !isString(value.id) || !date(value.startedAt) || !date(value.completedAt) ||
    Date.parse(value.completedAt) < Date.parse(value.startedAt) ||
    ![5, 10, 15, "all"].includes(value.sessionSize as never) ||
    !ids(value.selectedCardIds) || !ids(value.missedCardIds) ||
    ![value.totalReviewed, value.sessionCardCount, value.remembered, value.missed, value.skipped].every(count) ||
    !count(value.successRate) || value.successRate > 100 ||
    !isString(value.recommendedNextAction) ||
    !Array.isArray(value.topMissedTags) || !value.topMissedTags.every(item => isRecord(item) && MISTAKE_TAGS.includes(item.tag as never) && count(item.count)) ||
    !Array.isArray(value.verdictBreakdown) || !value.verdictBreakdown.every(item => isRecord(item) && MOVE_VERDICTS.includes(item.verdict as never) && count(item.count))) return false;
  const remembered = value.remembered as number, missed = value.missed as number, skipped = value.skipped as number;
  if (value.sessionCardCount !== value.selectedCardIds.length ||
    value.totalReviewed !== remembered + missed + skipped || (value.totalReviewed as number) > value.selectedCardIds.length ||
    value.missedCardIds.length !== missed || !value.missedCardIds.every(id => value.selectedCardIds instanceof Array && value.selectedCardIds.includes(id)) ||
    value.successRate !== (remembered + missed ? Math.round(remembered / (remembered + missed) * 100) : 0)) return false;
  if (value.results === undefined) return true; // Earlier summaries did not store individual results.
  if (!Array.isArray(value.results) || value.results.length !== value.totalReviewed) return false;
  const results = value.results;
  return results.every(result => isRecord(result) && isString(result.cardId) &&
    (value.selectedCardIds as string[]).includes(result.cardId) && date(result.recordedAt) &&
    ["remembered", "missed", "skipped"].includes(result.result as string) &&
    (result.attemptedMoveSan === undefined || isString(result.attemptedMoveSan)) &&
    (result.expectedMoveSan === undefined || isString(result.expectedMoveSan)) &&
    (result.attemptedFenAfter === undefined || isValidFen(result.attemptedFenAfter))) &&
    new Set(results.map(result => result.cardId)).size === results.length &&
    results.filter(r => r.result === "remembered").length === remembered &&
    results.filter(r => r.result === "missed").length === missed &&
    results.filter(r => r.result === "skipped").length === skipped &&
    results.filter(r => r.result === "missed").every(r => (value.missedCardIds as string[]).includes(r.cardId));
}

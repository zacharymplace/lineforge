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
): LineForgeBackup {
  return {
    lineforgeBackupVersion: 1,
    exportedAt: new Date().toISOString(),
    savedGames: library.savedGames,
    activeGameId: library.activeGameId,
    mistakeCards,
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
    !value.mistakeCards.every(isCard)
  ) {
    return false;
  }

  return (
    value.activeGameId === null ||
    value.savedGames.some((game) => game.id === value.activeGameId)
  );
}

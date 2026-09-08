import { Chess, type Square } from "chess.js";
import type {
  DrillAttempt,
  DrillAttemptMethod,
  DrillAttemptResult,
  MistakeCard,
  ReviewResult,
} from "../move-ledger/types";

export function getReviewTarget(card: MistakeCard) {
  return card.correction ?? { moveSan: card.moveSan, fenAfter: card.fenAfter };
}

export function evaluateDrillMove(
  card: MistakeCard,
  sourceSquare: string,
  targetSquare: string,
): DrillAttemptResult {
  const chess = new Chess(card.fenBefore);
  const target = getReviewTarget(card);

  try {
    const attemptedMove = chess.move({
      from: sourceSquare as Square,
      to: targetSquare as Square,
      promotion: "q",
    });
    const isMatch = attemptedMove.san === target.moveSan || chess.fen() === target.fenAfter;

    return {
      reviewResult: isMatch ? "remembered" : "missed",
      attemptedSan: attemptedMove.san,
      attemptedFenAfter: chess.fen(),
      expectedSan: target.moveSan,
      isMatch,
    };
  } catch {
    return {
      reviewResult: "missed",
      attemptedSan: null,
      attemptedFenAfter: null,
      expectedSan: target.moveSan,
      isMatch: false,
    };
  }
}

export function createDrillAttempt(
  card: MistakeCard,
  result: ReviewResult,
  method: DrillAttemptMethod,
  attemptedSan?: string | null,
  attemptedFenAfter?: string | null,
): DrillAttempt {
  return {
    id: `attempt-${Date.now()}-${crypto.randomUUID()}`,
    attemptedAt: new Date().toISOString(),
    attemptedMoveSan: attemptedSan ?? undefined,
    attemptedFenAfter: attemptedFenAfter ?? undefined,
    expectedMoveSan: getReviewTarget(card).moveSan,
    result,
    method,
  };
}

export function appendDrillAttempt(card: MistakeCard, attempt: DrillAttempt): MistakeCard {
  const attemptHistory = [...(card.attemptHistory ?? []), attempt];
  const correct = attemptHistory.filter(
    (currentAttempt) => currentAttempt.result === "remembered",
  ).length;

  return {
    ...card,
    attemptHistory,
    attempts: attemptHistory.length,
    correct,
    lastReviewedAt: attempt.attemptedAt,
  };
}

export function getSuccessRate(card: MistakeCard) {
  return card.attempts > 0 ? Math.round((card.correct / card.attempts) * 100) : 0;
}

export function normalizeCardReviewStats(card: MistakeCard): MistakeCard {
  const attemptHistory = card.attemptHistory ?? [];

  if (attemptHistory.length === 0) {
    return {
      ...card,
      attemptHistory,
    };
  }

  return {
    ...card,
    attemptHistory,
    attempts: attemptHistory.length,
    correct: attemptHistory.filter((attempt) => attempt.result === "remembered").length,
    lastReviewedAt: attemptHistory.at(-1)?.attemptedAt,
  };
}

export function evaluateDrillSan(card: MistakeCard, san: string): DrillAttemptResult {
  const chess = new Chess(card.fenBefore);
  const target = getReviewTarget(card);
  try {
    const move = chess.move(san.trim(), { strict: true });
    const isMatch = move.san === target.moveSan;
    return { reviewResult: isMatch ? "remembered" : "missed", attemptedSan: move.san, attemptedFenAfter: chess.fen(), expectedSan: target.moveSan, isMatch };
  } catch {
    return { reviewResult: "missed", attemptedSan: null, attemptedFenAfter: null, expectedSan: target.moveSan, isMatch: false };
  }
}

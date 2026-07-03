import type {
  LineForgeGame,
  MistakeCard,
  MoveAnnotation,
  ReviewResult,
} from "../move-ledger/types";

export function createMistakeCard(
  game: LineForgeGame,
  ply: number,
  annotation?: MoveAnnotation,
): MistakeCard | null {
  const move = game.moves[ply - 1];

  if (!move) {
    return null;
  }

  return {
    id: `card-${Date.now()}-${crypto.randomUUID()}`,
    sourceGameId: game.id,
    ply,
    fenBefore: move.before,
    fenAfter: move.after,
    moveSan: move.san,
    prompt: `Find the move played on ply ${ply}.`,
    note: annotation?.thought ?? "",
    tags: annotation?.tags ?? [],
    verdict: annotation?.verdict ?? "unclear",
    createdAt: new Date().toISOString(),
    attempts: 0,
    correct: 0,
    attemptHistory: [],
  };
}

export function applyReviewResult(card: MistakeCard, result: ReviewResult): MistakeCard {
  const attemptHistory = card.attemptHistory ?? [];

  return {
    ...card,
    attemptHistory,
    attempts: attemptHistory.length || card.attempts + 1,
    correct: attemptHistory.length
      ? attemptHistory.filter((attempt) => attempt.result === "remembered").length
      : card.correct + (result === "remembered" ? 1 : 0),
    lastReviewedAt: new Date().toISOString(),
  };
}

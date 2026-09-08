import { Chess } from "chess.js";
import type { CorrectionTarget, MistakeCard } from "../move-ledger/types";

export type CorrectionInput = { move: string; reason: string; source: string };

export function createCorrection(card: Pick<MistakeCard, "fenBefore" | "moveSan">, input: CorrectionInput): CorrectionTarget {
  if (!input.move.trim() || !input.reason.trim() || !input.source.trim()) {
    throw new Error("Add an alternative move, a reason, and its source.");
  }
  const chess = new Chess(card.fenBefore);
  let move;
  try { move = chess.move(input.move.trim(), { strict: true }); }
  catch { throw new Error("That move is not legal here. Use chess notation, such as Qe7 or exd8=N."); }
  if (move.san === card.moveSan) throw new Error("Choose an alternative to the original move.");
  return { moveSan: move.san, fenAfter: chess.fen(), reason: input.reason.trim(), source: input.source.trim(), savedAt: new Date().toISOString() };
}

export function isValidCorrection(value: unknown, card: Pick<MistakeCard, "fenBefore" | "moveSan">): value is CorrectionTarget {
  if (!value || typeof value !== "object") return false;
  const correction = value as CorrectionTarget;
  if (![correction.moveSan, correction.reason, correction.source, correction.savedAt].every(item => typeof item === "string" && item.trim())) return false;
  if (!Number.isFinite(Date.parse(correction.savedAt))) return false;
  try {
    const rebuilt = createCorrection(card, { move: correction.moveSan, reason: correction.reason, source: correction.source });
    return rebuilt.moveSan === correction.moveSan && rebuilt.fenAfter === correction.fenAfter;
  } catch { return false; }
}

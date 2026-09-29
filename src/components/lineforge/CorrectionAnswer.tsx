import type { MistakeCard } from "@/lib/move-ledger/types";

export function CorrectionAnswer({ card }: { card: MistakeCard }) {
  if (!card.correction) return <p>Game recall · played move: {card.moveSan}</p>;
  return <div className="grid gap-2 border-[1.5px] border-dashed border-spot p-3 text-sm">
    <p>Saved correction: <strong>{card.correction.moveSan}</strong></p>
    <p>{card.correction.reason}</p>
    <p className="text-ink-muted">Source: {card.correction.source}</p>
    <p className="text-ink-muted">Original move: {card.moveSan}. This is your saved study target; other moves may also be valid.</p>
  </div>;
}

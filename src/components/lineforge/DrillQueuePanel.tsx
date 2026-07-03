"use client";

import { Chessboard } from "react-chessboard";
import { getSuccessRate } from "@/lib/drill-queue/review";
import { formatEvaluation } from "@/lib/engine/local-engine";
import type { DrillAttemptResult, MistakeCard, ReviewResult } from "@/lib/move-ledger/types";

type DrillQueuePanelProps = {
  cards: MistakeCard[];
  selectedCardId: string | null;
  revealed: boolean;
  onSelectCard: (cardId: string) => void;
  onReveal: () => void;
  onReview: (cardId: string, result: ReviewResult) => void;
  onAttemptMove: (
    card: MistakeCard,
    sourceSquare: string,
    targetSquare: string,
  ) => DrillAttemptResult;
  attemptResult: DrillAttemptResult | null;
};

export function DrillQueuePanel({
  cards,
  selectedCardId,
  revealed,
  onSelectCard,
  onReveal,
  onReview,
  onAttemptMove,
  attemptResult,
}: DrillQueuePanelProps) {
  const selectedCard = cards.find((card) => card.id === selectedCardId) ?? cards[0] ?? null;
  const selectedAttempts = selectedCard?.attemptHistory ?? [];
  const lastAttempt = selectedAttempts.at(-1);

  return (
    <section className="grid gap-4 rounded-lg border border-stone-800 bg-stone-950/80 p-4">
      <div>
        <h2 className="text-lg font-semibold text-stone-100">DrillQueue</h2>
        <p className="text-sm text-stone-500">Review saved positions from your own games.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(180px,240px)_1fr]">
        <div className="max-h-80 overflow-auto rounded-md border border-stone-800">
          {cards.length === 0 ? (
            <div className="p-3 text-sm text-stone-500">Create a mistake card to begin.</div>
          ) : (
            cards.map((card) => (
              <button
                key={card.id}
                className={`grid w-full gap-1 border-b border-stone-800 px-3 py-2 text-left text-sm last:border-b-0 hover:bg-stone-900 ${
                  selectedCard?.id === card.id ? "bg-stone-900 text-amber-100" : "text-stone-300"
                }`}
                onClick={() => onSelectCard(card.id)}
              >
                <span>
                  Ply {card.ply}: {card.verdict}
                </span>
                <span className="text-xs text-stone-500">
                  {card.correct}/{card.attempts} remembered
                </span>
              </button>
            ))
          )}
        </div>

        {selectedCard ? (
          <div className="grid gap-3">
            <div className="grid gap-2 rounded-md bg-black/30 p-3 text-sm sm:grid-cols-3">
              <div>
                <div className="text-xs text-stone-500">Success rate</div>
                <div className="font-semibold text-amber-100">
                  {getSuccessRate(selectedCard)}%
                </div>
              </div>
              <div>
                <div className="text-xs text-stone-500">Last reviewed</div>
                <div className="text-stone-200">
                  {selectedCard.lastReviewedAt
                    ? new Date(selectedCard.lastReviewedAt).toLocaleString()
                    : "Never"}
                </div>
              </div>
              <div>
                <div className="text-xs text-stone-500">Last result</div>
                <div className="text-stone-200">{lastAttempt?.result ?? "None"}</div>
              </div>
            </div>
            <div className="max-w-sm overflow-hidden rounded-lg border border-stone-800 bg-stone-950 p-2">
              <Chessboard
                options={{
                  id: `drill-${selectedCard.id}`,
                  position: selectedCard.fenBefore,
                  allowDragging: !revealed && !attemptResult,
                  boardStyle: { borderRadius: "6px" },
                  darkSquareStyle: { backgroundColor: "#6f5b43" },
                  lightSquareStyle: { backgroundColor: "#d7c7a4" },
                  onPieceDrop: ({ sourceSquare, targetSquare }) => {
                    if (!targetSquare || revealed || attemptResult) {
                      return false;
                    }

                    const result = onAttemptMove(selectedCard, sourceSquare, targetSquare);
                    return result.isMatch;
                  },
                }}
              />
            </div>
            <div className="rounded-md bg-black/30 p-3 text-sm text-stone-300">
              {attemptResult
                ? attemptResult.isMatch
                  ? "Correct. Review stats updated."
                  : `Missed. Expected ${attemptResult.expectedSan}${
                      attemptResult.attemptedSan ? `, got ${attemptResult.attemptedSan}` : ""
                    }.`
                : selectedCard.prompt}
            </div>
            {!revealed && !attemptResult ? (
              <button className="lf-button-primary" onClick={onReveal}>
                Reveal move
              </button>
            ) : (
              <div className="grid gap-3">
                <div className="grid gap-2 rounded-md bg-black/30 p-3 text-sm">
                  <div>
                    <span className="text-stone-500">Original move: </span>
                    <span className="font-mono text-amber-100">{selectedCard.moveSan}</span>
                  </div>
                  <div>
                    <span className="text-stone-500">Verdict: </span>
                    <span>{selectedCard.verdict}</span>
                  </div>
                  <div>
                    <span className="text-stone-500">Tags: </span>
                    <span>{selectedCard.tags.join(", ") || "none"}</span>
                  </div>
                  <div className="text-stone-300">{selectedCard.note || "No note saved."}</div>
                  {selectedCard.engineAnalysis ? (
                    <div>
                      <span className="text-stone-500">Engine: </span>
                      <span className="font-mono text-amber-100">
                        {selectedCard.engineAnalysis.bestMoveSan ??
                          selectedCard.engineAnalysis.bestMoveUci}{" "}
                        · {formatEvaluation(selectedCard.engineAnalysis.evaluation)}
                      </span>
                    </div>
                  ) : null}
                </div>
                {!attemptResult ? (
                  <div className="flex flex-wrap gap-2">
                    <button
                      className="lf-button-primary"
                      onClick={() => onReview(selectedCard.id, "remembered")}
                    >
                      Remembered
                    </button>
                    <button
                      className="lf-button"
                      onClick={() => onReview(selectedCard.id, "missed")}
                    >
                      Missed
                    </button>
                  </div>
                ) : null}
              </div>
            )}
            <div className="grid gap-2 rounded-md bg-black/30 p-3 text-sm">
              <div className="text-stone-500">Recent attempts</div>
              {selectedAttempts.length === 0 ? (
                <div className="text-stone-500">No attempts yet.</div>
              ) : (
                [...selectedAttempts]
                  .slice(-5)
                  .reverse()
                  .map((attempt) => (
                    <div
                      key={attempt.id}
                      className="grid gap-1 border-t border-stone-800 pt-2 first:border-t-0 first:pt-0"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span
                          className={
                            attempt.result === "remembered"
                              ? "text-emerald-200"
                              : "text-red-200"
                          }
                        >
                          {attempt.result}
                        </span>
                        <span className="text-xs text-stone-500">
                          {new Date(attempt.attemptedAt).toLocaleString()}
                        </span>
                      </div>
                      <div className="text-xs text-stone-400">
                        {attempt.method} · expected {attempt.expectedMoveSan}
                        {attempt.attemptedMoveSan
                          ? ` · played ${attempt.attemptedMoveSan}`
                          : ""}
                      </div>
                    </div>
                  ))
              )}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

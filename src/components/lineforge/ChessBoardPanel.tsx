"use client";

import { Chessboard } from "react-chessboard";
import type { LineForgeGame } from "@/lib/move-ledger/types";

type ChessBoardPanelProps = {
  fen: string;
  game: LineForgeGame;
  currentPly: number;
  onDrop: (sourceSquare: string, targetSquare: string) => boolean;
  onGoToPly: (ply: number) => void;
  onUndo: () => void;
  onReset: () => void;
};

export function ChessBoardPanel({
  fen,
  game,
  currentPly,
  onDrop,
  onGoToPly,
  onUndo,
  onReset,
}: ChessBoardPanelProps) {
  const currentMove = currentPly > 0 ? game.moves[currentPly - 1] : null;

  return (
    <section className="grid min-w-0 gap-3 sm:gap-4">
      <div className="mx-auto w-full max-w-lg overflow-hidden border-[1.5px] border-ink bg-paper p-1.5 sm:p-2 xl:max-w-[30rem]">
        <Chessboard
          options={{
            id: "lineforge-board",
            position: fen,
            animationDurationInMs: 160,
            boardStyle: { borderRadius: "6px" },
            darkSquareStyle: { backgroundColor: "#6f5b43" },
            lightSquareStyle: { backgroundColor: "#d7c7a4" },
            // The two square colours are fixed, so the coordinate labels sit on a fixed paper chip: no single text colour
            // clears contrast on both squares (light-grey labels were 1.9:1 on the light squares).
            alphaNotationStyle: { color: "#12110f", backgroundColor: "#f1efe8", fontSize: "10px", fontWeight: 700, lineHeight: 1.2, padding: "0 2px" },
            numericNotationStyle: { color: "#12110f", backgroundColor: "#f1efe8", fontSize: "10px", fontWeight: 700, lineHeight: 1.2, padding: "0 2px" },
            onPieceDrop: ({ sourceSquare, targetSquare }) =>
              targetSquare ? onDrop(sourceSquare, targetSquare) : false,
          }}
        />
      </div>

      <div className="grid gap-3 border-[1.5px] border-ink bg-paper-2 p-3 sm:p-4">
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
          <button className="lf-button" onClick={() => onGoToPly(0)}>
            Start
          </button>
          <button className="lf-button" onClick={() => onGoToPly(currentPly - 1)}>
            Previous
          </button>
          <button className="lf-button" onClick={() => onGoToPly(currentPly + 1)}>
            Next
          </button>
          <button className="lf-button" onClick={() => onGoToPly(game.moves.length)}>
            End
          </button>
          <button className="lf-button" onClick={onUndo}>
            Undo
          </button>
          <button className="lf-button-danger" onClick={onReset}>
            Reset
          </button>
        </div>

        <div className="grid gap-2 text-sm text-ink-2">
          <div className="flex items-center justify-between gap-3">
            <span className="text-ink-muted">Ply</span>
            <span className="font-mono">
              {currentPly} / {game.moves.length}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-ink-muted">Current move</span>
            <span className="font-mono">{currentMove?.san ?? "Start position"}</span>
          </div>
        </div>
      </div>
    </section>
  );
}

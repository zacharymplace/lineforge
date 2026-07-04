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
      <div className="mx-auto w-full max-w-lg overflow-hidden rounded-lg border border-stone-700 bg-stone-950 p-1.5 shadow-2xl shadow-black/40 sm:p-2 xl:max-w-[30rem]">
        <Chessboard
          options={{
            id: "lineforge-board",
            position: fen,
            animationDurationInMs: 160,
            boardStyle: { borderRadius: "6px" },
            darkSquareStyle: { backgroundColor: "#6f5b43" },
            lightSquareStyle: { backgroundColor: "#d7c7a4" },
            onPieceDrop: ({ sourceSquare, targetSquare }) =>
              targetSquare ? onDrop(sourceSquare, targetSquare) : false,
          }}
        />
      </div>

      <div className="grid gap-3 rounded-lg border border-stone-800 bg-stone-950/80 p-3 sm:p-4">
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

        <div className="grid gap-2 text-sm text-stone-300">
          <div className="flex items-center justify-between gap-3">
            <span className="text-stone-500">Ply</span>
            <span className="font-mono">
              {currentPly} / {game.moves.length}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-stone-500">Current move</span>
            <span className="font-mono">{currentMove?.san ?? "Start position"}</span>
          </div>
        </div>
      </div>
    </section>
  );
}

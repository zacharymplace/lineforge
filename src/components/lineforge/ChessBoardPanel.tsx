"use client";

import { Chessboard } from "react-chessboard";
import { boardColors } from "@/lib/ui/board-style";
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
            ...boardColors,
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

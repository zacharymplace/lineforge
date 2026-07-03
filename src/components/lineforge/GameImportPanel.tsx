"use client";

import { useState } from "react";
import type { LineForgeGame } from "@/lib/move-ledger/types";

type GameImportPanelProps = {
  game: LineForgeGame;
  fen: string;
  pgn: string;
  onImportPgn: (pgn: string) => string | null;
  onGoToPly: (ply: number) => void;
};

export function GameImportPanel({
  game,
  fen,
  pgn,
  onImportPgn,
  onGoToPly,
}: GameImportPanelProps) {
  const [draftPgn, setDraftPgn] = useState("");
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  function handleImport() {
    const error = onImportPgn(draftPgn);
    setMessage(error ?? "PGN imported.");
    setIsError(Boolean(error));
    if (!error) {
      setDraftPgn("");
    }
  }

  return (
    <section className="grid gap-4 rounded-lg border border-stone-800 bg-stone-950/80 p-4">
      <div>
        <h2 className="text-lg font-semibold text-stone-100">MoveLedger</h2>
        <p className="text-sm text-stone-500">Import, replay, and inspect your game record.</p>
      </div>

      <textarea
        className="lf-field min-h-32 resize-y"
        placeholder="Paste PGN here"
        value={draftPgn}
        onChange={(event) => setDraftPgn(event.target.value)}
      />
      <div className="flex flex-wrap items-center gap-2">
        <button className="lf-button-primary" onClick={handleImport}>
          Import PGN
        </button>
        {message ? (
          <span className={`text-sm ${isError ? "text-red-200" : "text-stone-400"}`}>
            {message}
          </span>
        ) : null}
      </div>

      <div className="grid gap-3 text-sm">
        <div>
          <div className="mb-1 text-stone-500">Current FEN</div>
          <code className="block break-all rounded-md bg-black/35 p-3 text-xs text-amber-100">
            {fen}
          </code>
        </div>
        <div>
          <div className="mb-1 text-stone-500">Current PGN</div>
          <code className="block max-h-32 overflow-auto whitespace-pre-wrap rounded-md bg-black/35 p-3 text-xs text-amber-100">
            {pgn || "(No moves yet)"}
          </code>
        </div>
      </div>

      <div className="max-h-64 overflow-auto rounded-md border border-stone-800">
        {game.moves.length === 0 ? (
          <div className="p-3 text-sm text-stone-500">Moves will appear here.</div>
        ) : (
          game.moves.map((move) => (
            <button
              key={`${move.ply}-${move.san}`}
              className="flex w-full items-center justify-between border-b border-stone-800 px-3 py-2 text-left text-sm text-stone-300 last:border-b-0 hover:bg-stone-900"
              onClick={() => onGoToPly(move.ply)}
            >
              <span className="font-mono text-stone-500">{move.ply}</span>
              <span>{move.san}</span>
            </button>
          ))
        )}
      </div>
    </section>
  );
}

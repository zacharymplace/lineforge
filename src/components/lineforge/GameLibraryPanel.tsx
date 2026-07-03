"use client";

import { useState } from "react";
import type { LineForgeGame, MoveLedgerLibrary } from "@/lib/move-ledger/types";
import { summarizeGame } from "@/lib/move-ledger/library";

type GameLibraryPanelProps = {
  activeGame: LineForgeGame;
  library: MoveLedgerLibrary;
  isDraftGame: boolean;
  hasUnsavedChanges: boolean;
  onSaveGame: (name: string) => void;
  onRenameSavedGame: (name: string) => void;
  onUpdateDraftName: (name: string) => void;
  onReloadSavedGame: () => void;
  onLoadGame: (gameId: string) => void;
  onDeleteGame: (gameId: string) => void;
};

export function GameLibraryPanel({
  activeGame,
  library,
  isDraftGame,
  hasUnsavedChanges,
  onSaveGame,
  onRenameSavedGame,
  onUpdateDraftName,
  onReloadSavedGame,
  onLoadGame,
  onDeleteGame,
}: GameLibraryPanelProps) {
  const [name, setName] = useState(activeGame.name);
  const summaries = library.savedGames.map(summarizeGame);

  function handleSave() {
    onSaveGame(name);
  }

  return (
    <section className="grid gap-4 rounded-lg border border-stone-800 bg-stone-950/80 p-4">
      <div>
        <h2 className="text-lg font-semibold text-stone-100">Game library</h2>
        <p className="text-sm text-stone-500">
          Active game: <span className="text-amber-100">{activeGame.name}</span>
          <span className="ml-2 text-xs text-stone-400">
            {isDraftGame ? "Draft game" : hasUnsavedChanges ? "Unsaved changes" : "Saved"}
          </span>
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <input
          className="lf-field"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            if (isDraftGame) {
              onUpdateDraftName(event.target.value);
            }
          }}
          onFocus={() => setName(activeGame.name)}
          placeholder={isDraftGame ? "Draft name" : "Saved game name"}
        />
        <button className="lf-button-primary" onClick={handleSave}>
          {isDraftGame ? "Save draft" : "Save changes"}
        </button>
      </div>

      {!isDraftGame ? (
        <div className="flex flex-wrap gap-2">
          <button className="lf-button" onClick={() => onRenameSavedGame(name)}>
            Rename saved game
          </button>
          {hasUnsavedChanges ? (
            <button className="lf-button-danger" onClick={onReloadSavedGame}>
              Discard changes
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="max-h-72 overflow-auto rounded-md border border-stone-800">
        {summaries.length === 0 ? (
          <div className="p-3 text-sm text-stone-500">No saved games yet.</div>
        ) : (
          summaries.map((summary) => (
            <div
              key={summary.id}
              className="grid gap-2 border-b border-stone-800 p-3 last:border-b-0 sm:grid-cols-[1fr_auto]"
            >
              <div>
                <div className="font-medium text-stone-100">
                  {summary.name}
                  {library.activeGameId === summary.id ? (
                    <span className="ml-2 text-xs text-amber-100">active</span>
                  ) : null}
                </div>
                <div className="text-xs text-stone-500">
                  {summary.moveCount} plies · updated{" "}
                  {new Date(summary.updatedAt).toLocaleString()}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button className="lf-button" onClick={() => onLoadGame(summary.id)}>
                  Load
                </button>
                <button className="lf-button-danger" onClick={() => onDeleteGame(summary.id)}>
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

"use client";

import { useState } from "react";
import { Chessboard } from "react-chessboard";
import { boardColors } from "@/lib/ui/board-style";
import {
  clampPreviewPly,
  getPreviewMoveLabel,
  getPreviewPosition,
  LINEFORGE_DEMO_PGN,
} from "@/lib/move-ledger/import-preview";
import type { LineForgeGame, PgnImportPreview } from "@/lib/move-ledger/types";
import { StatusHint } from "./StatusHint";

type GameImportPanelProps = {
  game: LineForgeGame;
  fen: string;
  pgn: string;
  hasUnsavedChanges: boolean;
  onPreviewPgn: (pgn: string) => { preview: PgnImportPreview | null; error: string | null };
  onConfirmImport: (preview: PgnImportPreview, name: string) => void;
  onCancelImport: () => void;
  onGoToPly: (ply: number) => void;
};

export function GameImportPanel({
  game,
  fen,
  pgn,
  hasUnsavedChanges,
  onPreviewPgn,
  onConfirmImport,
  onCancelImport,
  onGoToPly,
}: GameImportPanelProps) {
  const [draftPgn, setDraftPgn] = useState("");
  const [preview, setPreview] = useState<PgnImportPreview | null>(null);
  const [previewPly, setPreviewPly] = useState(0);
  const [draftName, setDraftName] = useState("Imported Game");
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  function previewPgn(nextPgn: string, successMessage = "PGN preview ready.") {
    const result = onPreviewPgn(nextPgn);

    if (result.error || !result.preview) {
      setPreview(null);
      setMessage(result.error ?? "Could not parse that PGN.");
      setIsError(true);
      return;
    }

    setPreview(result.preview);
    setPreviewPly(0);
    setDraftName(result.preview.suggestedName);
    setMessage(successMessage);
    setIsError(false);
  }

  function handlePreview() {
    previewPgn(draftPgn);
  }

  function handleDemoPreview() {
    setDraftPgn(LINEFORGE_DEMO_PGN);
    previewPgn(LINEFORGE_DEMO_PGN, "Demo PGN preview ready.");
  }

  function handleConfirm() {
    if (!preview) {
      return;
    }

    onConfirmImport(preview, draftName);
    setPreview(null);
    setPreviewPly(0);
    setDraftPgn("");
    setMessage("PGN imported as an unsaved draft.");
    setIsError(false);
  }

  function handleCancel() {
    setPreview(null);
    setPreviewPly(0);
    setMessage("Import canceled.");
    setIsError(false);
    onCancelImport();
  }

  return (
    <section className="grid gap-3 border-[1.5px] border-ink bg-paper-2 p-3 sm:p-4">
      <div>
        <h2 className="text-base font-semibold text-ink">PGN import</h2>
        <p className="text-sm text-ink-muted">
          Preview and inspect a game record before replacing the active board.
        </p>
      </div>
      <p className="text-sm text-ink-muted">
        Paste a PGN or try the demo game to start building mistake cards.
      </p>
      {hasUnsavedChanges ? (
        <div className="border-[1.5px] border-dashed border-spot bg-spot-tint p-3 text-sm text-ink">
          Current game has unsaved changes. Previewing is safe; confirming an import will replace
          the active draft.
        </div>
      ) : null}

      <textarea
        className="lf-field min-h-32 resize-y"
        placeholder="Paste PGN here"
        value={draftPgn}
        onChange={(event) => setDraftPgn(event.target.value)}
      />
      <div className="flex flex-wrap items-center gap-2">
        <button className="lf-button-primary" onClick={handlePreview}>
          Preview PGN
        </button>
        <button className="lf-button" onClick={handleDemoPreview}>
          Try demo game
        </button>
        {isError && message ? (
          <span className="border-l-4 border-spot pl-2 text-sm text-ink font-bold" role="alert">
            {message}
          </span>
        ) : (
          <StatusHint message={message} className="text-sm text-ink-muted" />
        )}
      </div>

      {preview ? (
        <div className="grid gap-3 border-[1.5px] border-ink bg-paper-2 p-3 text-sm">
          {preview.warning ? (
            <div
              className="border-[1.5px] border-dashed border-spot bg-spot-tint p-2 text-ink"
              role="status"
              aria-live="polite"
            >
              {preview.warning}
            </div>
          ) : null}
          <div className="grid gap-1 bg-paper-2 p-3">
            <div className="text-base font-semibold text-ink">{preview.previewTitle}</div>
            <div className="text-xs text-ink-muted">
              {preview.metadata.result !== "Unknown" ? `${preview.metadata.result} · ` : ""}
              {preview.movePreview.totalPlyCount} plies
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <PreviewRow label="White" value={preview.metadata.white} />
            <PreviewRow label="Black" value={preview.metadata.black} />
            <PreviewRow label="Event" value={preview.metadata.event} />
            <PreviewRow label="Site" value={preview.metadata.site} />
            <PreviewRow label="Date" value={preview.metadata.date} />
            <PreviewRow label="Result" value={preview.metadata.result} />
            <PreviewRow label="Move count" value={String(preview.moveCount)} />
            <PreviewRow label="Validation" value={preview.validationStatus} />
          </div>
          <div>
            <div className="mb-1 text-ink-muted">Final FEN</div>
            <code className="block break-all bg-paper-2 p-2 text-xs text-ink">
              {preview.finalFen}
            </code>
          </div>
          <div className="grid gap-3 bg-paper-2 p-3">
            <div className="flex items-center justify-between gap-3">
              <span className="font-medium text-ink-2">Move preview</span>
              <span className="text-xs text-ink-muted">
                {preview.movePreview.totalPlyCount} total plies
              </span>
            </div>
            <MoveSnippetList label="First moves" moves={preview.movePreview.first} />
            {preview.movePreview.hasDistinctLastMoves ? (
              <MoveSnippetList label="Last moves" moves={preview.movePreview.last} />
            ) : null}
          </div>
          <PreviewBoardScrubber
            preview={preview}
            previewPly={previewPly}
            onGoToPly={setPreviewPly}
          />
          <label className="grid gap-1">
            <span className="text-ink-muted">Draft name</span>
            <input
              className="lf-field"
              value={draftName}
              onChange={(event) => setDraftName(event.target.value)}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button className="lf-button-primary" onClick={handleConfirm}>
              Import game
            </button>
            <button className="lf-button" onClick={handleCancel}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      <div className="grid gap-3 text-sm">
        <div>
          <div className="mb-1 text-ink-muted">Current FEN</div>
          <code className="block break-all bg-paper-2 p-3 text-xs text-ink">
            {fen}
          </code>
        </div>
        <div>
          <div className="mb-1 text-ink-muted">Current PGN</div>
          <code className="block max-h-32 overflow-auto whitespace-pre-wrap bg-paper-2 p-3 text-xs text-ink">
            {pgn || "(No moves yet)"}
          </code>
        </div>
      </div>

      <div className="max-h-64 overflow-auto border-[1.5px] border-ink">
        {game.moves.length === 0 ? (
          <div className="p-3 text-sm text-ink-muted">Moves will appear here.</div>
        ) : (
          game.moves.map((move) => (
            <button
              key={`${move.ply}-${move.san}`}
              className="flex w-full items-center justify-between border-b border-ink px-3 py-2 text-left text-sm text-ink-2 last:border-b-0 hover:bg-paper-3"
              onClick={() => onGoToPly(move.ply)}
            >
              <span className="font-mono text-ink-muted">{move.ply}</span>
              <span>{move.san}</span>
            </button>
          ))
        )}
      </div>
    </section>
  );
}

function PreviewBoardScrubber({
  preview,
  previewPly,
  onGoToPly,
}: {
  preview: PgnImportPreview;
  previewPly: number;
  onGoToPly: (ply: number) => void;
}) {
  const safePly = clampPreviewPly(previewPly, preview.boardPreview.totalPlyCount);
  const position = getPreviewPosition(preview.boardPreview, safePly);
  const moveLabel = getPreviewMoveLabel(preview.boardPreview, safePly);

  function goToPly(ply: number) {
    onGoToPly(clampPreviewPly(ply, preview.boardPreview.totalPlyCount));
  }

  return (
    <div className="grid gap-3 border-[1.5px] border-ink bg-paper-2 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="font-medium text-ink-2">Preview board</div>
          <div className="text-xs text-ink-muted">Imported PGN only</div>
        </div>
        <div className="font-mono text-xs text-ink-muted">
          Ply {safePly} / {preview.boardPreview.totalPlyCount}
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-[180px_1fr]">
        <div className="max-w-[180px] overflow-hidden border-[1.5px] border-ink bg-paper p-1">
          <Chessboard
            options={{
              id: "lineforge-import-preview-board",
              position: position.fen,
              allowDragging: false,
              boardStyle: { borderRadius: "4px" },
              ...boardColors,
            }}
          />
        </div>
        <div className="grid content-start gap-3">
          <div className="grid gap-1 bg-paper-2 p-2">
            <div className="text-xs text-ink-muted">Current move</div>
            <div className="font-mono text-ink">{moveLabel}</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="lf-button" onClick={() => goToPly(0)}>
              Start
            </button>
            <button className="lf-button" onClick={() => goToPly(safePly - 1)}>
              Previous
            </button>
            <button className="lf-button" onClick={() => goToPly(safePly + 1)}>
              Next
            </button>
            <button
              className="lf-button"
              onClick={() => goToPly(preview.boardPreview.totalPlyCount)}
            >
              End
            </button>
          </div>
          <div>
            <div className="mb-1 text-xs text-ink-muted">Preview FEN</div>
            <code className="block break-all bg-paper-2 p-2 text-xs text-ink">
              {position.fen}
            </code>
          </div>
        </div>
      </div>
    </div>
  );
}

function MoveSnippetList({
  label,
  moves,
}: {
  label: string;
  moves: PgnImportPreview["movePreview"]["first"];
}) {
  return (
    <div className="grid gap-2">
      <div className="text-xs text-ink-muted">{label}</div>
      <div className="flex flex-wrap gap-2">
        {moves.length === 0 ? (
          <span className="text-ink-muted">No moves.</span>
        ) : (
          moves.map((move) => (
            <span
              key={`${label}-${move.ply}-${move.san}`}
              className="border-[1.5px] border-ink bg-paper px-2 py-1 font-mono text-xs text-ink-2"
            >
              {move.ply}. {move.san}
            </span>
          ))
        )}
      </div>
    </div>
  );
}

function PreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-paper-2 p-2">
      <div className="text-xs text-ink-muted">{label}</div>
      <div className="text-ink-2">{value}</div>
    </div>
  );
}

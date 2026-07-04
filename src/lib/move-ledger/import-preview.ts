import { Chess } from "chess.js";
import { createGameFromChess } from "./game";
import type {
  LineForgeGame,
  PgnBoardPreview,
  PgnBoardPreviewPosition,
  PgnImportMetadata,
  PgnImportResult,
  PgnMovePreview,
} from "./types";

const UNKNOWN = "Unknown";

export const LINEFORGE_DEMO_PGN = `[Event "LineForge Demo"]
[Site "Local"]
[Date "2026.07.03"]
[White "Demo White"]
[Black "Demo Black"]
[Result "1-0"]

1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7# 1-0`;

export function parsePgnImportPreview(
  pgn: string,
  hasUnsavedChanges: boolean,
): PgnImportResult {
  try {
    const trimmedPgn = pgn.trim();

    if (!trimmedPgn) {
      return {
        ok: false,
        error: "Paste a PGN before previewing import.",
      };
    }

    const chess = new Chess();
    chess.loadPgn(trimmedPgn, { strict: false });
    const headers = chess.getHeaders();
    const metadata = getMetadata(headers);
    const history = chess.history();
    const previewTitle = suggestDraftName(metadata);
    const boardPreview = buildPreviewPositions(trimmedPgn);

    return {
      ok: true,
      preview: {
        pgn: trimmedPgn,
        metadata,
        previewTitle,
        suggestedName: previewTitle,
        movePreview: createMovePreview(history),
        boardPreview,
        moveCount: history.length,
        finalFen: chess.fen(),
        validationStatus: "valid",
        hasUnsavedWarning: hasUnsavedChanges,
        warning: hasUnsavedChanges
          ? "Current game has unsaved changes. Importing will replace the active draft."
          : undefined,
      },
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not parse that PGN.",
    };
  }
}

export function createGameFromImportPreview(
  preview: { pgn: string },
  name: string,
): LineForgeGame {
  const chess = new Chess();
  chess.loadPgn(preview.pgn, { strict: false });

  return {
    ...createGameFromChess(chess),
    name: name.trim() || "Imported Game",
  };
}

export function suggestDraftName(metadata: PgnImportMetadata) {
  if (metadata.white !== UNKNOWN && metadata.black !== UNKNOWN) {
    return `${metadata.white} vs ${metadata.black}`;
  }

  if (metadata.event !== UNKNOWN && metadata.date !== UNKNOWN) {
    return `${metadata.event} - ${metadata.date}`;
  }

  return "Imported Game";
}

export function createMovePreview(moves: string[]): PgnMovePreview {
  const first = moves.slice(0, 6).map(toSnippet);
  const hasDistinctLastMoves = moves.length > 12;
  const last = hasDistinctLastMoves
    ? moves.slice(-6).map((san, index) => ({
        ply: moves.length - 6 + index + 1,
        san,
      }))
    : [];

  return {
    first,
    last,
    totalPlyCount: moves.length,
    hasDistinctLastMoves,
  };
}

export function buildPreviewPositions(pgn: string): PgnBoardPreview {
  const chess = new Chess();
  chess.loadPgn(pgn, { strict: false });
  const moves = chess.history({ verbose: true });

  return {
    positions: [
      {
        ply: 0,
        fen: new Chess().fen(),
      },
      ...moves.map((move, index) => ({
        ply: index + 1,
        fen: move.after,
        moveSan: move.san,
      })),
    ],
    totalPlyCount: moves.length,
  };
}

export function clampPreviewPly(ply: number, totalPlyCount: number) {
  return Math.max(0, Math.min(ply, totalPlyCount));
}

export function getPreviewPosition(
  boardPreview: PgnBoardPreview,
  ply: number,
): PgnBoardPreviewPosition {
  const safePly = clampPreviewPly(ply, boardPreview.totalPlyCount);
  return (
    boardPreview.positions.find((position) => position.ply === safePly) ??
    boardPreview.positions[0]
  );
}

export function getPreviewMoveLabel(boardPreview: PgnBoardPreview, ply: number) {
  const position = getPreviewPosition(boardPreview, ply);
  return position.moveSan ?? "Start position";
}

function toSnippet(san: string, index: number) {
  return {
    ply: index + 1,
    san,
  };
}

function getMetadata(headers: Record<string, string>) {
  return {
    white: normalizeHeader(headers.White),
    black: normalizeHeader(headers.Black),
    event: normalizeHeader(headers.Event),
    site: normalizeHeader(headers.Site),
    date: normalizeHeader(headers.Date),
    result: normalizeHeader(headers.Result),
  };
}

function normalizeHeader(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed && trimmed !== "?" ? trimmed : UNKNOWN;
}

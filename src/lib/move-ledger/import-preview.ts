import { Chess } from "chess.js";
import { createGameFromChess } from "./game";
import type {
  LineForgeGame,
  PgnImportMetadata,
  PgnImportResult,
  PgnMovePreview,
} from "./types";

const UNKNOWN = "Unknown";

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

    return {
      ok: true,
      preview: {
        pgn: trimmedPgn,
        metadata,
        previewTitle,
        suggestedName: previewTitle,
        movePreview: createMovePreview(history),
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

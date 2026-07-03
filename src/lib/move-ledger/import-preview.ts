import { Chess } from "chess.js";
import { createGameFromChess } from "./game";
import type { LineForgeGame, PgnImportMetadata, PgnImportResult } from "./types";

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

    return {
      ok: true,
      preview: {
        pgn: trimmedPgn,
        metadata,
        suggestedName: suggestDraftName(metadata),
        moveCount: chess.history().length,
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

import { Chess, type Move, type Square } from "chess.js";
import type { LineForgeGame, LineForgeMove } from "./types";

export const STARTING_FEN = new Chess().fen();
export const DEFAULT_GAME_NAME = "Untitled game";
const LEGACY_DEFAULT_GAME_NAME = "Analysis board";

export function createGameId() {
  return `game-${Date.now()}-${crypto.randomUUID()}`;
}

export function normalizeDefaultGameName(name: string | null | undefined) {
  const trimmedName = name?.trim();

  if (!trimmedName || trimmedName === LEGACY_DEFAULT_GAME_NAME) {
    return DEFAULT_GAME_NAME;
  }

  return trimmedName;
}

export function getDisplayGameName(game: Pick<LineForgeGame, "name"> | string | null | undefined) {
  return normalizeDefaultGameName(typeof game === "string" ? game : game?.name);
}

export function hasMeaningfulGameContent(
  game: Pick<LineForgeGame, "name" | "pgn" | "moves" | "annotations">,
) {
  return (
    game.moves.length > 0 ||
    Boolean(game.pgn.trim()) ||
    Object.keys(game.annotations).length > 0 ||
    normalizeDefaultGameName(game.name) !== DEFAULT_GAME_NAME
  );
}

export function shouldWarnBeforeReplacingGame({
  game,
  isDraftGame,
  hasUnsavedChanges,
}: {
  game: Pick<LineForgeGame, "name" | "pgn" | "moves" | "annotations">;
  isDraftGame: boolean;
  hasUnsavedChanges: boolean;
}) {
  return isDraftGame ? hasMeaningfulGameContent(game) : hasUnsavedChanges;
}

export function createEmptyGame(): LineForgeGame {
  const chess = new Chess();
  const now = new Date().toISOString();

  return {
    id: createGameId(),
    name: DEFAULT_GAME_NAME,
    pgn: chess.pgn(),
    initialFen: STARTING_FEN,
    fen: chess.fen(),
    moves: [],
    annotations: {},
    importedAt: now,
    createdAt: now,
    updatedAt: now,
  };
}

export function toLineForgeMoves(moves: Move[]): LineForgeMove[] {
  return moves.map((move, index) => ({
    ply: index + 1,
    from: move.from,
    to: move.to,
    san: move.san,
    before: move.before,
    after: move.after,
    color: move.color,
    piece: move.piece,
  }));
}

export function createGameFromChess(
  chess: Chess,
  existing?: Pick<
    LineForgeGame,
    "id" | "createdAt" | "annotations" | "name" | "importedAt" | "initialFen"
  >,
): LineForgeGame {
  const now = new Date().toISOString();

  return {
    id: existing?.id ?? createGameId(),
    name: existing?.name ?? DEFAULT_GAME_NAME,
    pgn: chess.pgn(),
    initialFen: chess.history({ verbose: true })[0]?.before ?? chess.fen(),
    fen: chess.fen(),
    moves: toLineForgeMoves(chess.history({ verbose: true })),
    annotations: existing?.annotations ?? {},
    importedAt: existing?.importedAt ?? now,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}

export function loadGameAtPly(game: LineForgeGame, ply: number) {
  const chess = new Chess();
  // Replay the canonical PGN so headers, comments, and custom starts survive edits.
  chess.loadPgn(game.pgn, { strict: false });
  const totalPlies = chess.history().length;
  const safePly = Math.max(0, Math.min(Math.trunc(ply) || 0, totalPlies));

  for (let remaining = totalPlies; remaining > safePly; remaining--) {
    chess.undo();
  }

  return chess;
}

export function importPgn(pgn: string): LineForgeGame {
  const chess = new Chess();
  chess.loadPgn(pgn.trim(), { strict: false });
  return {
    ...createGameFromChess(chess),
    name: "Imported PGN",
  };
}

export function tryMove(chess: Chess, sourceSquare: string, targetSquare: string) {
  try {
    return chess.move({
      from: sourceSquare as Square,
      to: targetSquare as Square,
      promotion: "q",
    });
  } catch {
    return null;
  }
}

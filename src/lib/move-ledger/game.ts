import { Chess, type Move, type Square } from "chess.js";
import type { LineForgeGame, LineForgeMove } from "./types";

export const STARTING_FEN = new Chess().fen();

export function createGameId() {
  return `game-${Date.now()}-${crypto.randomUUID()}`;
}

export function createEmptyGame(): LineForgeGame {
  const chess = new Chess();
  const now = new Date().toISOString();

  return {
    id: createGameId(),
    name: "Analysis board",
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
    name: existing?.name ?? "Analysis board",
    pgn: chess.pgn(),
    initialFen: existing?.initialFen ?? STARTING_FEN,
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
  const safePly = Math.max(0, Math.min(ply, game.moves.length));

  for (const move of game.moves.slice(0, safePly)) {
    chess.move(move.san);
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

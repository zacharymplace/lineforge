import type { LineForgeGame, MoveLedgerLibrary, SavedGameSummary } from "./types";

export function createEmptyLibrary(activeGameId: string | null = null): MoveLedgerLibrary {
  return {
    savedGames: [],
    activeGameId,
  };
}

export function summarizeGame(game: LineForgeGame): SavedGameSummary {
  return {
    id: game.id,
    name: game.name,
    importedAt: game.importedAt,
    updatedAt: game.updatedAt,
    moveCount: game.moves.length,
  };
}

export function upsertSavedGame(
  library: MoveLedgerLibrary,
  game: LineForgeGame,
  name = game.name,
): MoveLedgerLibrary {
  const now = new Date().toISOString();
  const savedGame: LineForgeGame = {
    ...game,
    name: name.trim() || game.name || "Untitled game",
    importedAt: game.importedAt || now,
    updatedAt: now,
  };
  const exists = library.savedGames.some((currentGame) => currentGame.id === savedGame.id);

  return {
    activeGameId: savedGame.id,
    savedGames: exists
      ? library.savedGames.map((currentGame) =>
          currentGame.id === savedGame.id ? savedGame : currentGame,
        )
      : [savedGame, ...library.savedGames],
  };
}

export function renameSavedGame(
  library: MoveLedgerLibrary,
  gameId: string,
  name: string,
): MoveLedgerLibrary {
  const now = new Date().toISOString();
  const nextName = name.trim() || "Untitled game";

  return {
    ...library,
    savedGames: library.savedGames.map((game) =>
      game.id === gameId ? { ...game, name: nextName, updatedAt: now } : game,
    ),
  };
}

export function loadSavedGame(library: MoveLedgerLibrary, gameId: string) {
  return library.savedGames.find((game) => game.id === gameId) ?? null;
}

export function isGameSaved(library: MoveLedgerLibrary, gameId: string) {
  return library.savedGames.some((game) => game.id === gameId);
}

export function hasUnsavedChanges(library: MoveLedgerLibrary, activeGame: LineForgeGame) {
  const savedGame = loadSavedGame(library, activeGame.id);

  if (!savedGame) {
    return true;
  }

  return stableGameSnapshot(savedGame) !== stableGameSnapshot(activeGame);
}

function stableGameSnapshot(game: LineForgeGame) {
  return JSON.stringify({
    id: game.id,
    name: game.name,
    pgn: game.pgn,
    initialFen: game.initialFen,
    fen: game.fen,
    moves: game.moves,
    annotations: game.annotations,
    importedAt: game.importedAt,
  });
}

export function deleteSavedGame(library: MoveLedgerLibrary, gameId: string): MoveLedgerLibrary {
  const savedGames = library.savedGames.filter((game) => game.id !== gameId);
  const activeGameId =
    library.activeGameId === gameId ? (savedGames[0]?.id ?? null) : library.activeGameId;

  return {
    savedGames,
    activeGameId,
  };
}

import type { LineForgeGame, MistakeCard, MoveLedgerLibrary } from "./types";
import { normalizeCardReviewStats } from "../drill-queue/review";
import { createEmptyLibrary, upsertSavedGame } from "./library";

const GAME_KEY = "lineforge.moveLedger.currentGame.v1";
const LIBRARY_KEY = "lineforge.moveLedger.library.v1";
const CARDS_KEY = "lineforge.mistakeGraph.cards.v1";

export type StorageReadStatus = {
  key: string;
  message: string;
};

const storageWarnings: StorageReadStatus[] = [];

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") {
    return fallback;
  }

  try {
    const stored = window.localStorage.getItem(key);
    return stored ? (JSON.parse(stored) as T) : fallback;
  } catch {
    storageWarnings.push({
      key,
      message: `Could not read saved local data for ${key}; using a safe fallback.`,
    });
    return fallback;
  }
}

function writeJson<T>(key: string, value: T) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(key, JSON.stringify(value));
}

export function loadStoredGame() {
  return readJson<LineForgeGame | null>(GAME_KEY, null);
}

export function saveStoredGame(game: LineForgeGame) {
  writeJson(GAME_KEY, game);
}

export function loadStoredLibrary(): MoveLedgerLibrary {
  const library = readJson<MoveLedgerLibrary | null>(LIBRARY_KEY, null);

  if (library) {
    return library;
  }

  const legacyGame = loadStoredGame();
  return legacyGame
    ? upsertSavedGame(createEmptyLibrary(legacyGame.id), legacyGame)
    : createEmptyLibrary();
}

export function saveStoredLibrary(library: MoveLedgerLibrary) {
  writeJson(LIBRARY_KEY, library);
}

export function loadStoredCards() {
  return readJson<MistakeCard[]>(CARDS_KEY, []).map(normalizeCardReviewStats);
}

export function saveStoredCards(cards: MistakeCard[]) {
  writeJson(CARDS_KEY, cards);
}

export function consumeStorageWarnings() {
  const warnings = [...storageWarnings];
  storageWarnings.length = 0;
  return warnings;
}

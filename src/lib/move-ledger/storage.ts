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

export type StorageWriteResult = { saved: boolean; failedKeys: string[] };

function writeJson<T>(key: string, value: T): StorageWriteResult {
  try {
    if (typeof window === "undefined") return { saved: false, failedKeys: [key] };
    window.localStorage.setItem(key, JSON.stringify(value));
    return { saved: true, failedKeys: [] };
  } catch {
    // Keep the current in-memory data available for export and retry.
    return { saved: false, failedKeys: [key] };
  }
}

/** Separate storage keys are not an atomic transaction; try every write. */
export function saveStudyData(game: LineForgeGame, library: MoveLedgerLibrary, cards: MistakeCard[], sessionSummaries?: import("../drill-queue/session").ReviewSessionSummary[]): StorageWriteResult {
  const results = [saveStoredGame(game), saveStoredLibrary(library), saveStoredCards(cards)];
  if (sessionSummaries !== undefined) results.push(writeJson("lineforge.drillQueue.sessionSummaries.v1", sessionSummaries));
  const failedKeys = results.flatMap((result) => result.failedKeys);
  return { saved: failedKeys.length === 0, failedKeys };
}

export function loadStoredGame() {
  return readJson<LineForgeGame | null>(GAME_KEY, null);
}

export function saveStoredGame(game: LineForgeGame) {
  return writeJson(GAME_KEY, game);
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
  return writeJson(LIBRARY_KEY, library);
}

export function loadStoredCards() {
  return readJson<MistakeCard[]>(CARDS_KEY, []).map(normalizeCardReviewStats);
}

export function saveStoredCards(cards: MistakeCard[]) {
  return writeJson(CARDS_KEY, cards);
}

export function consumeStorageWarnings() {
  const warnings = [...storageWarnings];
  storageWarnings.length = 0;
  return warnings;
}

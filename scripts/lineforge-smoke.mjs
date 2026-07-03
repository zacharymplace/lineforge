import assert from "node:assert/strict";
import { Chess, validateFen } from "chess.js";

const verdicts = ["good", "mistake", "blunder", "unclear"];
const tags = ["missed tactic", "hung piece", "time pressure"];

function calculateMistakeStats(cards) {
  const byVerdict = Object.fromEntries(verdicts.map((verdict) => [verdict, 0]));
  const tagCounts = new Map();

  for (const card of cards) {
    byVerdict[card.verdict] += 1;
    for (const tag of card.tags) {
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }
  }

  return {
    totalCards: cards.length,
    byVerdict,
    topTags: [...tagCounts.entries()]
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count),
  };
}

function formatEvaluation(evaluation) {
  return evaluation.type === "mate"
    ? `M${evaluation.value}`
    : `${evaluation.value > 0 ? "+" : ""}${(evaluation.value / 100).toFixed(2)}`;
}

function nextEngineStatus(current, event) {
  if (event === "load") return "loading";
  if (event === "ready") return "ready";
  if (event === "analyze") return "analyzing";
  if (event === "stop") return current === "analyzing" ? "ready" : current;
  if (event === "error") return "error";
  return "idle";
}

function attachAnalysisToCard(card, analysis) {
  return {
    ...card,
    engineAnalysis: analysis,
  };
}

function attachAnalysisToAnnotation(annotation, analysis) {
  return {
    ...annotation,
    engineAnalysis: analysis,
    updatedAt: new Date().toISOString(),
  };
}

function clearAnalysis(value) {
  const { engineAnalysis, ...rest } = value;
  void engineAnalysis;
  return rest;
}

function applyReviewResult(card, result) {
  return {
    ...card,
    attemptHistory: card.attemptHistory ?? [],
    attempts: card.attempts + 1,
    correct: card.correct + (result === "remembered" ? 1 : 0),
    lastReviewedAt: new Date().toISOString(),
  };
}

function createAttempt(card, result, method, attemptedMoveSan, attemptedFenAfter) {
  return {
    id: `attempt-${method}-${card.attempts + 1}`,
    attemptedAt: new Date().toISOString(),
    attemptedMoveSan,
    attemptedFenAfter,
    expectedMoveSan: card.moveSan,
    result,
    method,
  };
}

function appendAttempt(card, attempt) {
  const attemptHistory = [...(card.attemptHistory ?? []), attempt];

  return {
    ...card,
    attemptHistory,
    attempts: attemptHistory.length,
    correct: attemptHistory.filter((currentAttempt) => currentAttempt.result === "remembered")
      .length,
    lastReviewedAt: attempt.attemptedAt,
  };
}

function createEmptyLibrary(activeGameId = null) {
  return { savedGames: [], activeGameId };
}

function upsertSavedGame(library, game, name = game.name) {
  const savedGame = {
    ...game,
    name: name.trim() || game.name || "Untitled game",
    updatedAt: new Date().toISOString(),
  };
  const exists = library.savedGames.some((currentGame) => currentGame.id === game.id);

  return {
    activeGameId: game.id,
    savedGames: exists
      ? library.savedGames.map((currentGame) =>
          currentGame.id === game.id ? savedGame : currentGame,
        )
      : [savedGame, ...library.savedGames],
  };
}

function renameSavedGame(library, gameId, name) {
  const nextName = name.trim() || "Untitled game";

  return {
    ...library,
    savedGames: library.savedGames.map((game) =>
      game.id === gameId
        ? { ...game, name: nextName, updatedAt: new Date().toISOString() }
        : game,
    ),
  };
}

function loadSavedGame(library, gameId) {
  return library.savedGames.find((game) => game.id === gameId) ?? null;
}

function hasUnsavedChanges(library, activeGame) {
  const savedGame = loadSavedGame(library, activeGame.id);

  if (!savedGame) {
    return true;
  }

  return stableGameSnapshot(savedGame) !== stableGameSnapshot(activeGame);
}

function stableGameSnapshot(game) {
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

function deleteSavedGame(library, gameId) {
  const savedGames = library.savedGames.filter((game) => game.id !== gameId);
  return {
    savedGames,
    activeGameId:
      library.activeGameId === gameId ? (savedGames[0]?.id ?? null) : library.activeGameId,
  };
}

function evaluateDrillMove(card, sourceSquare, targetSquare) {
  const drillChess = new Chess(card.fenBefore);

  try {
    const attemptedMove = drillChess.move({
      from: sourceSquare,
      to: targetSquare,
      promotion: "q",
    });
    const isMatch = attemptedMove.san === card.moveSan || drillChess.fen() === card.fenAfter;

    return {
      reviewResult: isMatch ? "remembered" : "missed",
      attemptedSan: attemptedMove.san,
      attemptedFenAfter: drillChess.fen(),
      expectedSan: card.moveSan,
      isMatch,
    };
  } catch {
    return {
      reviewResult: "missed",
      attemptedSan: null,
      attemptedFenAfter: null,
      expectedSan: card.moveSan,
      isMatch: false,
    };
  }
}

function createBackup(library, mistakeCards) {
  return {
    lineforgeBackupVersion: 1,
    exportedAt: new Date().toISOString(),
    savedGames: library.savedGames,
    activeGameId: library.activeGameId,
    mistakeCards,
  };
}

function parseBackupJson(json) {
  const parsed = JSON.parse(json);

  assert.equal(parsed.lineforgeBackupVersion, 1);
  assert.ok(Array.isArray(parsed.savedGames));
  assert.ok(Array.isArray(parsed.mistakeCards));
  assert.equal(typeof parsed.exportedAt, "string");
  for (const savedGame of parsed.savedGames) {
    assert.equal(validateFen(savedGame.fen).ok, true);
    if (savedGame.initialFen) {
      assert.equal(validateFen(savedGame.initialFen).ok, true);
    }
    if (savedGame.pgn.trim()) {
      const pgnChess = new Chess();
      pgnChess.loadPgn(savedGame.pgn, { strict: false });
    }
    for (const move of savedGame.moves) {
      assert.equal(validateFen(move.before).ok, true);
      assert.equal(validateFen(move.after).ok, true);
    }
  }
  assert.ok(
    parsed.activeGameId === null ||
      parsed.savedGames.some((savedGame) => savedGame.id === parsed.activeGameId),
  );
  for (const cardToValidate of parsed.mistakeCards) {
    assert.equal(validateFen(cardToValidate.fenBefore).ok, true);
    assert.equal(validateFen(cardToValidate.fenAfter).ok, true);
    assert.ok(Array.isArray(cardToValidate.attemptHistory));
    for (const attempt of cardToValidate.attemptHistory) {
      if (attempt.attemptedFenAfter) {
        assert.equal(validateFen(attempt.attemptedFenAfter).ok, true);
      }
    }
    assert.equal(cardToValidate.attempts, cardToValidate.attemptHistory.length);
    assert.equal(
      cardToValidate.correct,
      cardToValidate.attemptHistory.filter((attempt) => attempt.result === "remembered").length,
    );
  }
  return parsed;
}

function parsePgnImportPreview(pgn, hasUnsavedChangesValue) {
  try {
    const trimmedPgn = pgn.trim();
    if (!trimmedPgn) {
      return { ok: false, error: "Paste a PGN before previewing import." };
    }

    const previewChess = new Chess();
    previewChess.loadPgn(trimmedPgn, { strict: false });
    const headers = previewChess.getHeaders();
    const normalizeHeader = (value) => {
      const trimmed = value?.trim();
      return trimmed && trimmed !== "?" ? trimmed : "Unknown";
    };
    const metadata = {
      white: normalizeHeader(headers.White),
      black: normalizeHeader(headers.Black),
      event: normalizeHeader(headers.Event),
      site: normalizeHeader(headers.Site),
      date: normalizeHeader(headers.Date),
      result: normalizeHeader(headers.Result),
    };
    const history = previewChess.history();
    const previewTitle =
      metadata.white !== "Unknown" && metadata.black !== "Unknown"
        ? `${metadata.white} vs ${metadata.black}`
        : metadata.event !== "Unknown" && metadata.date !== "Unknown"
          ? `${metadata.event} - ${metadata.date}`
          : "Imported Game";
    const createMovePreview = (moves) => {
      const first = moves.slice(0, 6).map((san, index) => ({ ply: index + 1, san }));
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
    };
    const buildPreviewPositions = (previewPgn) => {
      const boardChess = new Chess();
      boardChess.loadPgn(previewPgn, { strict: false });
      const moves = boardChess.history({ verbose: true });

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
    };

    return {
      ok: true,
      preview: {
        pgn: trimmedPgn,
        metadata,
        previewTitle,
        suggestedName: previewTitle,
        movePreview: createMovePreview(history),
        boardPreview: buildPreviewPositions(trimmedPgn),
        moveCount: history.length,
        finalFen: previewChess.fen(),
        validationStatus: "valid",
        hasUnsavedWarning: hasUnsavedChangesValue,
        warning: hasUnsavedChangesValue
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

function clampPreviewPly(ply, totalPlyCount) {
  return Math.max(0, Math.min(ply, totalPlyCount));
}

function getPreviewPosition(boardPreview, ply) {
  const safePly = clampPreviewPly(ply, boardPreview.totalPlyCount);
  return boardPreview.positions.find((position) => position.ply === safePly) ?? boardPreview.positions[0];
}

function getPreviewMoveLabel(boardPreview, ply) {
  return getPreviewPosition(boardPreview, ply).moveSan ?? "Start position";
}

function createGameFromImportPreview(preview, name) {
  const importedChess = new Chess();
  importedChess.loadPgn(preview.pgn, { strict: false });

  return {
    id: `game-import-smoke-${Date.now()}`,
    name: name.trim() || "Imported Game",
    pgn: importedChess.pgn(),
    initialFen: new Chess().fen(),
    fen: importedChess.fen(),
    moves: importedChess.history({ verbose: true }).map((move, index) => ({
      ply: index + 1,
      from: move.from,
      to: move.to,
      san: move.san,
      before: move.before,
      after: move.after,
      color: move.color,
      piece: move.piece,
    })),
    annotations: {},
    importedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

const samplePgn = "1. e4 e5 2. Nf3 Nc6 3. Bb5 a6";
const chess = new Chess();
chess.loadPgn(samplePgn);
assert.equal(chess.history().length, 6);
assert.equal(chess.history().at(-1), "a6");

const annotation = {
  ply: 4,
  thought: "I expected normal development.",
  verdict: "mistake",
  tags: [tags[0], tags[2]],
  updatedAt: new Date().toISOString(),
};
assert.deepEqual(JSON.parse(JSON.stringify(annotation)), annotation);

const card = {
  id: "card-smoke",
  sourceGameId: "game-smoke",
  ply: 4,
  fenBefore: chess.history({ verbose: true })[3].before,
  fenAfter: chess.history({ verbose: true })[3].after,
  moveSan: chess.history({ verbose: true })[3].san,
  prompt: "Find the move.",
  note: annotation.thought,
  tags: annotation.tags,
  verdict: annotation.verdict,
  createdAt: new Date().toISOString(),
  attempts: 0,
  correct: 0,
  attemptHistory: [],
};

const engineRequest = {
  fen: card.fenBefore,
  depth: 10,
  timeoutMs: 12000,
};
assert.equal(JSON.parse(JSON.stringify(engineRequest)).fen, card.fenBefore);

const engineResult = {
  fen: card.fenBefore,
  bestMoveUci: "b8c6",
  bestMoveSan: "Nc6",
  evaluation: {
    type: "cp",
    value: 32,
  },
  depth: 10,
  nodes: 123456,
  analyzedAt: new Date().toISOString(),
  engineName: "Stockfish 18 Lite Single",
};
assert.deepEqual(JSON.parse(JSON.stringify(engineResult)).evaluation, {
  type: "cp",
  value: 32,
});
assert.equal(formatEvaluation(engineResult.evaluation), "+0.32");
assert.equal(formatEvaluation({ type: "cp", value: -48 }), "-0.48");
assert.equal(formatEvaluation({ type: "mate", value: 3 }), "M3");
assert.equal(nextEngineStatus("idle", "load"), "loading");
assert.equal(nextEngineStatus("loading", "ready"), "ready");
assert.equal(nextEngineStatus("ready", "analyze"), "analyzing");
assert.equal(nextEngineStatus("analyzing", "stop"), "ready");
assert.equal(nextEngineStatus("ready", "error"), "error");
const analyzedCard = attachAnalysisToCard(card, engineResult);
assert.equal(analyzedCard.engineAnalysis.bestMoveSan, "Nc6");
assert.equal(clearAnalysis(analyzedCard).engineAnalysis, undefined);
const analyzedAnnotation = attachAnalysisToAnnotation(annotation, engineResult);
assert.equal(analyzedAnnotation.engineAnalysis.bestMoveUci, "b8c6");
assert.equal(clearAnalysis(analyzedAnnotation).engineAnalysis, undefined);

const game = {
  id: "game-smoke",
  name: "Smoke import",
  pgn: chess.pgn(),
  initialFen: new Chess().fen(),
  fen: chess.fen(),
  moves: chess.history({ verbose: true }).map((move, index) => ({
    ply: index + 1,
    from: move.from,
    to: move.to,
    san: move.san,
    before: move.before,
    after: move.after,
    color: move.color,
    piece: move.piece,
  })),
  annotations: { 4: annotation },
  importedAt: new Date().toISOString(),
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const serializedGames = JSON.parse(JSON.stringify([game]));
assert.equal(serializedGames[0].annotations[4].verdict, "mistake");

let activeGame = game;
const pgnWithMetadata = `[Event "Friday Arena"]
[Site "LineForge Local"]
[Date "2026.07.03"]
[White "Ada"]
[Black "Ben"]
[Result "1-0"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 1-0`;
const previewResult = parsePgnImportPreview(pgnWithMetadata, true);
assert.equal(previewResult.ok, true);
assert.equal(activeGame.id, game.id);
assert.equal(previewResult.preview.metadata.white, "Ada");
assert.equal(previewResult.preview.metadata.black, "Ben");
assert.equal(previewResult.preview.metadata.event, "Friday Arena");
assert.equal(previewResult.preview.metadata.site, "LineForge Local");
assert.equal(previewResult.preview.metadata.date, "2026.07.03");
assert.equal(previewResult.preview.metadata.result, "1-0");
assert.equal(previewResult.preview.moveCount, 6);
assert.equal(previewResult.preview.movePreview.totalPlyCount, 6);
assert.equal(previewResult.preview.boardPreview.totalPlyCount, 6);
assert.equal(previewResult.preview.boardPreview.positions.length, 7);
assert.equal(previewResult.preview.boardPreview.positions[0].fen, new Chess().fen());
assert.equal(
  getPreviewPosition(previewResult.preview.boardPreview, 6).fen,
  previewResult.preview.finalFen,
);
assert.equal(
  getPreviewPosition(previewResult.preview.boardPreview, 99).fen,
  previewResult.preview.finalFen,
);
assert.equal(getPreviewPosition(previewResult.preview.boardPreview, -4).fen, new Chess().fen());
assert.equal(clampPreviewPly(-2, previewResult.preview.boardPreview.totalPlyCount), 0);
assert.equal(clampPreviewPly(99, previewResult.preview.boardPreview.totalPlyCount), 6);
assert.equal(getPreviewMoveLabel(previewResult.preview.boardPreview, 0), "Start position");
assert.equal(getPreviewMoveLabel(previewResult.preview.boardPreview, 6), "a6");
assert.deepEqual(
  previewResult.preview.movePreview.first.map((move) => move.san),
  ["e4", "e5", "Nf3", "Nc6", "Bb5", "a6"],
);
assert.equal(previewResult.preview.movePreview.hasDistinctLastMoves, false);
assert.equal(previewResult.preview.movePreview.last.length, 0);
assert.equal(validateFen(previewResult.preview.finalFen).ok, true);
assert.equal(previewResult.preview.previewTitle, "Ada vs Ben");
assert.equal(previewResult.preview.suggestedName, "Ada vs Ben");
assert.equal(previewResult.preview.hasUnsavedWarning, true);
assert.match(previewResult.preview.warning, /unsaved changes/i);
const canceledActiveGame = activeGame;
assert.equal(canceledActiveGame.id, game.id);
const scrubbedPreviewPosition = getPreviewPosition(previewResult.preview.boardPreview, 3);
assert.equal(scrubbedPreviewPosition.moveSan, "Nf3");
assert.equal(activeGame.id, game.id);
activeGame = createGameFromImportPreview(previewResult.preview, "Ada prep game");
assert.notEqual(activeGame.id, game.id);
assert.equal(activeGame.name, "Ada prep game");
assert.equal(activeGame.moves.length, 6);
assert.equal(hasUnsavedChanges(createEmptyLibrary(), activeGame), true);

const missingMetadataPreview = parsePgnImportPreview("1. d4 d5 2. c4 e6", false);
assert.equal(missingMetadataPreview.ok, true);
assert.equal(missingMetadataPreview.preview.metadata.white, "Unknown");
assert.equal(missingMetadataPreview.preview.metadata.black, "Unknown");
assert.equal(missingMetadataPreview.preview.previewTitle, "Imported Game");
assert.equal(missingMetadataPreview.preview.suggestedName, "Imported Game");
assert.equal(missingMetadataPreview.preview.hasUnsavedWarning, false);

const eventOnlyPreview = parsePgnImportPreview(
  `[Event "Training Set"]
[Date "2026.07.03"]

1. c4 e5`,
  false,
);
assert.equal(eventOnlyPreview.ok, true);
assert.equal(eventOnlyPreview.preview.previewTitle, "Training Set - 2026.07.03");
assert.equal(eventOnlyPreview.preview.suggestedName, "Training Set - 2026.07.03");

const longPreview = parsePgnImportPreview(
  "1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 8. c3 O-O",
  false,
);
assert.equal(longPreview.ok, true);
assert.equal(longPreview.preview.movePreview.totalPlyCount, 16);
assert.deepEqual(
  longPreview.preview.movePreview.first.map((move) => move.san),
  ["e4", "e5", "Nf3", "Nc6", "Bb5", "a6"],
);
assert.deepEqual(
  longPreview.preview.movePreview.last.map((move) => move.san),
  ["Re1", "b5", "Bb3", "d6", "c3", "O-O"],
);
assert.equal(longPreview.preview.movePreview.first[0].ply, 1);
assert.equal(longPreview.preview.movePreview.last[0].ply, 11);
assert.equal(longPreview.preview.movePreview.hasDistinctLastMoves, true);

const invalidPreview = parsePgnImportPreview("this is not pgn", true);
assert.equal(invalidPreview.ok, false);
assert.equal(activeGame.name, "Ada prep game");

let library = createEmptyLibrary();
assert.equal(hasUnsavedChanges(library, game), true);
library = upsertSavedGame(library, game, "Smoke saved game");
assert.equal(library.savedGames.length, 1);
assert.equal(loadSavedGame(library, "game-smoke").name, "Smoke saved game");
const savedSmokeGame = loadSavedGame(library, "game-smoke");
assert.equal(hasUnsavedChanges(library, savedSmokeGame), false);
const unsavedSmokeGame = {
  ...savedSmokeGame,
  annotations: {
    ...savedSmokeGame.annotations,
    5: { ...annotation, ply: 5, thought: "New note" },
  },
};
assert.equal(
  hasUnsavedChanges(library, unsavedSmokeGame),
  true,
);
const reloadedSmokeGame = loadSavedGame(library, unsavedSmokeGame.id);
assert.equal(reloadedSmokeGame.annotations[5], undefined);
assert.equal(hasUnsavedChanges(library, reloadedSmokeGame), false);
library = renameSavedGame(library, "game-smoke", "Renamed smoke game");
const renamedGame = loadSavedGame(library, "game-smoke");
assert.equal(renamedGame.id, "game-smoke");
assert.equal(renamedGame.name, "Renamed smoke game");
assert.equal(renamedGame.pgn, savedSmokeGame.pgn);
assert.deepEqual(renamedGame.annotations, savedSmokeGame.annotations);
const draftGame = { ...game, id: "draft-smoke", name: "My draft name" };
assert.equal(hasUnsavedChanges(library, draftGame), true);
library = upsertSavedGame(library, draftGame, draftGame.name);
assert.equal(loadSavedGame(library, "draft-smoke").name, "My draft name");
library = upsertSavedGame(library, unsavedSmokeGame);
assert.equal(hasUnsavedChanges(library, loadSavedGame(library, "game-smoke")), false);
library = upsertSavedGame(library, { ...game, id: "game-smoke-2" }, "Second game");
assert.equal(library.savedGames.length, 3);
library = deleteSavedGame(library, "game-smoke");
assert.equal(loadSavedGame(library, "game-smoke"), null);
assert.equal(library.savedGames.length, 2);

const stats = calculateMistakeStats([
  card,
  { ...card, id: "card-smoke-2", verdict: "blunder", tags: ["hung piece"] },
]);
assert.equal(stats.totalCards, 2);
assert.equal(stats.byVerdict.mistake, 1);
assert.equal(stats.byVerdict.blunder, 1);
assert.equal(stats.topTags[0].tag, "missed tactic");

const correctAttempt = evaluateDrillMove(card, "b8", "c6");
assert.equal(correctAttempt.isMatch, true);
const correctReviewed = appendAttempt(
  card,
  createAttempt(
    card,
    correctAttempt.reviewResult,
    "played",
    correctAttempt.attemptedSan,
    correctAttempt.attemptedFenAfter,
  ),
);
assert.equal(correctReviewed.attempts, 1);
assert.equal(correctReviewed.correct, 1);
assert.equal(correctReviewed.attemptHistory.length, 1);
assert.equal(correctReviewed.attemptHistory[0].method, "played");

const missedAttempt = evaluateDrillMove(card, "g8", "f6");
assert.equal(missedAttempt.isMatch, false);
const missedReviewed = appendAttempt(
  correctReviewed,
  createAttempt(
    correctReviewed,
    missedAttempt.reviewResult,
    "played",
    missedAttempt.attemptedSan,
    missedAttempt.attemptedFenAfter,
  ),
);
assert.equal(missedReviewed.attemptHistory.length, 2);
assert.equal(missedReviewed.correct, 1);

const manualReviewed = appendAttempt(
  missedReviewed,
  createAttempt(missedReviewed, "missed", "manual-reveal"),
);
assert.equal(manualReviewed.attempts, 3);
assert.equal(manualReviewed.correct, 1);
assert.equal(manualReviewed.attemptHistory.at(-1).method, "manual-reveal");

const freshMissedReviewed = appendAttempt(
  card,
  createAttempt(card, missedAttempt.reviewResult, "played", missedAttempt.attemptedSan),
);
assert.equal(freshMissedReviewed.attemptHistory.length, 1);
assert.equal(freshMissedReviewed.attemptHistory[0].result, "missed");
assert.equal(freshMissedReviewed.attempts, 1);
assert.equal(freshMissedReviewed.correct, 0);
assert.equal(missedReviewed.attempts, 2);
assert.equal(freshMissedReviewed.correct, 0);

const remembered = applyReviewResult(card, "remembered");
assert.equal(remembered.attempts, 1);
assert.equal(remembered.correct, 1);

const missed = applyReviewResult(remembered, "missed");
assert.equal(missed.attempts, 2);
assert.equal(missed.correct, 1);

const backupLibrary = upsertSavedGame(createEmptyLibrary(), game, game.name);
const backup = createBackup(backupLibrary, [manualReviewed]);
const restored = parseBackupJson(JSON.stringify(backup));
assert.equal(restored.savedGames[0].id, game.id);
assert.equal(restored.activeGameId, game.id);
assert.equal(restored.mistakeCards[0].id, card.id);
assert.equal(restored.mistakeCards[0].attemptHistory.length, 3);
let importedState = { library: backupLibrary, cards: [manualReviewed] };
try {
  const invalidBackup = parseBackupJson(
    JSON.stringify({
      ...backup,
      savedGames: [{ ...game, fen: "not a fen" }],
    }),
  );
  importedState = {
    library: {
      savedGames: invalidBackup.savedGames,
      activeGameId: invalidBackup.activeGameId,
    },
    cards: invalidBackup.mistakeCards,
  };
} catch {
  // Keep the previous local state on failed import.
}
assert.equal(importedState.library.savedGames[0].id, game.id);
assert.equal(importedState.cards[0].id, manualReviewed.id);
assert.throws(() =>
  parseBackupJson(
    JSON.stringify({
      ...backup,
      mistakeCards: [{ ...manualReviewed, attempts: 99 }],
    }),
  ),
);
assert.throws(() =>
  parseBackupJson(
    JSON.stringify({
      ...backup,
      savedGames: [{ ...game, fen: "not a fen" }],
    }),
  ),
);
assert.throws(() =>
  parseBackupJson(
    JSON.stringify({
      ...backup,
      savedGames: [{ ...game, pgn: "this is not pgn" }],
    }),
  ),
);
assert.throws(() =>
  parseBackupJson(
    JSON.stringify({
      ...backup,
      mistakeCards: [{ ...manualReviewed, fenBefore: "not a fen" }],
    }),
  ),
);
assert.throws(() => parseBackupJson("{ nope"));

console.log("LineForge smoke test passed.");

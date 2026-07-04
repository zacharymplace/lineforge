"use client";

import { useEffect, useMemo, useState } from "react";
import { BackupPanel } from "./BackupPanel";
import { ChessBoardPanel } from "./ChessBoardPanel";
import { DrillQueuePanel } from "./DrillQueuePanel";
import { EngineAnalysisPanel } from "./EngineAnalysisPanel";
import { GameImportPanel } from "./GameImportPanel";
import { GameLibraryPanel } from "./GameLibraryPanel";
import { MistakeDashboard } from "./MistakeDashboard";
import { MoveAnnotationPanel } from "./MoveAnnotationPanel";
import { ReviewSessionPanel } from "./ReviewSessionPanel";
import { DEFAULT_COACH_LENS_COMPARISON_IDS } from "@/lib/coach-lenses/lenses";
import {
  loadComparisonLensPreference,
  saveComparisonLensPreference,
} from "@/lib/coach-lenses/preferences";
import type { CoachLensId } from "@/lib/coach-lenses/types";
import {
  appendDrillAttempt,
  createDrillAttempt,
  evaluateDrillMove,
} from "@/lib/drill-queue/review";
import {
  clearReviewSessionSummaries,
  loadReviewSessionSummaries,
  saveReviewSessionSummary,
  type ReviewSessionSummary,
} from "@/lib/drill-queue/session";
import {
  attachAnalysisToAnnotation,
  attachAnalysisToCard,
} from "@/lib/engine/local-engine";
import type { EngineAnalysisResult } from "@/lib/engine/types";
import { createMistakeCard } from "@/lib/mistake-graph/cards";
import { buildOpeningWeaknessMap } from "@/lib/mistake-graph/opening-weakness-map";
import { buildOpeningWeaknessTrend } from "@/lib/mistake-graph/opening-weakness-trends";
import { calculateMistakeStats } from "@/lib/mistake-graph/stats";
import { emptyAnnotation } from "@/lib/move-ledger/annotations";
import { createBackup, parseBackupJson, serializeBackup } from "@/lib/move-ledger/backup";
import { createEmptyGame, createGameFromChess, loadGameAtPly, tryMove } from "@/lib/move-ledger/game";
import {
  createGameFromImportPreview,
  parsePgnImportPreview,
} from "@/lib/move-ledger/import-preview";
import {
  createEmptyLibrary,
  deleteSavedGame,
  hasUnsavedChanges,
  isGameSaved,
  loadSavedGame,
  renameSavedGame,
  upsertSavedGame,
} from "@/lib/move-ledger/library";
import {
  loadStoredCards,
  loadStoredGame,
  loadStoredLibrary,
  saveStoredCards,
  saveStoredGame,
  saveStoredLibrary,
  consumeStorageWarnings,
} from "@/lib/move-ledger/storage";
import type {
  DrillAttemptResult,
  LineForgeGame,
  MistakeCard,
  MoveAnnotation,
  MoveLedgerLibrary,
  PgnImportPreview,
  ReviewResult,
} from "@/lib/move-ledger/types";

export function LineForgeApp() {
  const [game, setGame] = useState<LineForgeGame>(() => createEmptyGame());
  const [library, setLibrary] = useState<MoveLedgerLibrary>(() => createEmptyLibrary());
  const [cards, setCards] = useState<MistakeCard[]>([]);
  const [currentPly, setCurrentPly] = useState(0);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [revealedCardId, setRevealedCardId] = useState<string | null>(null);
  const [attemptResult, setAttemptResult] = useState<DrillAttemptResult | null>(null);
  const [sessionSummaries, setSessionSummaries] = useState<ReviewSessionSummary[]>([]);
  const [comparisonLensIds, setComparisonLensIds] = useState<CoachLensId[]>(
    DEFAULT_COACH_LENS_COMPARISON_IDS,
  );
  const [storageMessages, setStorageMessages] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const storedLibrary = loadStoredLibrary();
    const storedGame = loadStoredGame();
    const storedCards = loadStoredCards();
    const activeGame =
      (storedLibrary.activeGameId
        ? loadSavedGame(storedLibrary, storedLibrary.activeGameId)
        : null) ??
      storedGame ??
      createEmptyGame();

    queueMicrotask(() => {
      setLibrary(storedLibrary);
      setGame(activeGame);
      setCurrentPly(activeGame.moves.length);
      setCards(storedCards);
      setSelectedCardId(storedCards[0]?.id ?? null);
      setSessionSummaries(loadReviewSessionSummaries());
      setComparisonLensIds(loadComparisonLensPreference());
      setStorageMessages(consumeStorageWarnings().map((warning) => warning.message));
      setHydrated(true);
    });
  }, []);

  useEffect(() => {
    if (hydrated) {
      saveStoredGame(game);
    }
  }, [game, hydrated]);

  useEffect(() => {
    if (hydrated) {
      saveStoredLibrary(library);
    }
  }, [library, hydrated]);

  useEffect(() => {
    if (hydrated) {
      saveStoredCards(cards);
    }
  }, [cards, hydrated]);

  const replayChess = useMemo(() => loadGameAtPly(game, currentPly), [game, currentPly]);
  const stats = useMemo(() => calculateMistakeStats(cards), [cards]);
  const openingMap = useMemo(
    () => buildOpeningWeaknessMap(library.savedGames, cards),
    [cards, library.savedGames],
  );
  const openingTrend = useMemo(
    () => buildOpeningWeaknessTrend(openingMap, cards, sessionSummaries),
    [cards, openingMap, sessionSummaries],
  );
  const isDraftGame = !isGameSaved(library, game.id);
  const hasDirtyGame = hasUnsavedChanges(library, game);
  const selectedCard = cards.find((card) => card.id === selectedCardId) ?? cards[0] ?? null;
  const currentAnnotation = game.annotations[currentPly];
  const sourceGameNames = useMemo(
    () => Object.fromEntries(library.savedGames.map((savedGame) => [savedGame.id, savedGame.name])),
    [library.savedGames],
  );

  function setActiveGame(nextGame: LineForgeGame) {
    setGame(nextGame);
  }

  function goToPly(ply: number) {
    setCurrentPly(Math.max(0, Math.min(ply, game.moves.length)));
  }

  function handleDrop(sourceSquare: string, targetSquare: string) {
    if (currentPly !== game.moves.length) {
      return false;
    }

    const chess = loadGameAtPly(game, game.moves.length);
    const move = tryMove(chess, sourceSquare, targetSquare);

    if (!move) {
      return false;
    }

    const nextGame = createGameFromChess(chess, game);
    setActiveGame(nextGame);
    setCurrentPly(nextGame.moves.length);
    return true;
  }

  function handleUndo() {
    if (game.moves.length === 0) {
      return;
    }

    const chess = loadGameAtPly(game, game.moves.length);
    chess.undo();
    const nextAnnotations = { ...game.annotations };
    delete nextAnnotations[game.moves.length];
    const nextGame = createGameFromChess(chess, {
      ...game,
      annotations: nextAnnotations,
    });

    setActiveGame(nextGame);
    setCurrentPly(Math.min(currentPly, nextGame.moves.length));
  }

  function handleReset() {
    const nextGame = createEmptyGame();
    setActiveGame(nextGame);
    setCurrentPly(0);
  }

  function handlePreviewPgn(pgn: string) {
    const result = parsePgnImportPreview(pgn, hasDirtyGame);

    return result.ok
      ? { preview: result.preview, error: null }
      : { preview: null, error: result.error };
  }

  function handleConfirmImport(preview: PgnImportPreview, name: string) {
    const nextGame = createGameFromImportPreview(preview, name);
    setActiveGame(nextGame);
    setCurrentPly(nextGame.moves.length);
  }

  function handleCancelImport() {
    return;
  }

  function handleSaveAnnotation(annotation: MoveAnnotation) {
    const nextGame = {
      ...game,
      annotations: {
        ...game.annotations,
        [annotation.ply]: annotation,
      },
      updatedAt: new Date().toISOString(),
    };
    setActiveGame(nextGame);
  }

  function handleSaveGame(name: string) {
    const nextLibrary = upsertSavedGame(library, game, name);
    const savedGame = loadSavedGame(nextLibrary, game.id) ?? game;
    setLibrary(nextLibrary);
    setGame(savedGame);
  }

  function handleRenameSavedGame(name: string) {
    if (isDraftGame) {
      return;
    }

    const nextLibrary = renameSavedGame(library, game.id, name);
    const renamedGame = loadSavedGame(nextLibrary, game.id);

    setLibrary(nextLibrary);
    if (renamedGame) {
      setGame((currentGame) => ({
        ...currentGame,
        name: renamedGame.name,
      }));
    }
  }

  function handleUpdateDraftName(name: string) {
    if (!isDraftGame) {
      return;
    }

    setGame((currentGame) => ({
      ...currentGame,
      name: name.trim() || "Analysis board",
      updatedAt: new Date().toISOString(),
    }));
  }

  function handleReloadSavedGame() {
    const savedGame = loadSavedGame(library, game.id);

    if (!savedGame) {
      return;
    }

    setGame(savedGame);
    setCurrentPly(savedGame.moves.length);
  }

  function handleLoadGame(gameId: string) {
    const savedGame = loadSavedGame(library, gameId);

    if (!savedGame) {
      return;
    }

    setLibrary((currentLibrary) => ({
      ...currentLibrary,
      activeGameId: gameId,
    }));
    setGame(savedGame);
    setCurrentPly(savedGame.moves.length);
  }

  function handleDeleteGame(gameId: string) {
    const nextLibrary = deleteSavedGame(library, gameId);
    const nextGame =
      nextLibrary.activeGameId && nextLibrary.activeGameId !== game.id
        ? loadSavedGame(nextLibrary, nextLibrary.activeGameId)
        : null;

    setLibrary(nextLibrary);
    if (gameId === game.id) {
      const replacement = nextGame ?? createEmptyGame();
      setGame(replacement);
      setCurrentPly(replacement.moves.length);
    }
  }

  function handleCreateCard() {
    const card = createMistakeCard(game, currentPly, game.annotations[currentPly]);

    if (!card) {
      return null;
    }

    setCards((currentCards) => [card, ...currentCards]);
    setSelectedCardId(card.id);
    setRevealedCardId(null);
    setAttemptResult(null);
    return card;
  }

  function handleSelectCard(cardId: string) {
    setSelectedCardId(cardId);
    setRevealedCardId(null);
    setAttemptResult(null);
  }

  function handleReview(cardId: string, result: ReviewResult) {
    setCards((currentCards) =>
      currentCards.map((card) => {
        if (card.id !== cardId) {
          return card;
        }

        return appendDrillAttempt(
          card,
          createDrillAttempt(card, result, "manual-reveal"),
        );
      }),
    );
    setRevealedCardId(null);
    setAttemptResult(null);
  }

  function handleSessionCardReview(cardId: string, result: ReviewResult) {
    setCards((currentCards) =>
      currentCards.map((card) => {
        if (card.id !== cardId) {
          return card;
        }

        return appendDrillAttempt(
          card,
          createDrillAttempt(card, result, "manual-reveal"),
        );
      }),
    );
  }

  function handleCompleteSession(summary: ReviewSessionSummary) {
    setSessionSummaries(saveReviewSessionSummary(summary));
  }

  function handleClearSessionHistory() {
    clearReviewSessionSummaries();
    setSessionSummaries([]);
  }

  function handleAttemptMove(
    card: MistakeCard,
    sourceSquare: string,
    targetSquare: string,
  ) {
    const result = evaluateDrillMove(card, sourceSquare, targetSquare);
    setCards((currentCards) =>
      currentCards.map((currentCard) => {
        if (currentCard.id !== card.id) {
          return currentCard;
        }

        return appendDrillAttempt(
          currentCard,
          createDrillAttempt(
            currentCard,
            result.reviewResult,
            "played",
            result.attemptedSan,
            result.attemptedFenAfter,
          ),
        );
      }),
    );
    setAttemptResult(result);
    setRevealedCardId(card.id);
    return result;
  }

  function handleAttachAnalysisToAnnotation(analysis: EngineAnalysisResult) {
    if (currentPly <= 0) {
      return;
    }

    const annotation = game.annotations[currentPly] ?? emptyAnnotation(currentPly);
    handleSaveAnnotation(attachAnalysisToAnnotation(annotation, analysis));
  }

  function handleAttachAnalysisToCard(cardId: string, analysis: EngineAnalysisResult) {
    setCards((currentCards) =>
      currentCards.map((card) =>
        card.id === cardId ? attachAnalysisToCard(card, analysis) : card,
      ),
    );
  }

  function handleComparisonLensIdsChange(lensIds: CoachLensId[]) {
    setComparisonLensIds(saveComparisonLensPreference(lensIds));
  }

  function handleExportBackup() {
    return serializeBackup(createBackup(upsertSavedGame(library, game, game.name), cards));
  }

  function handleImportBackup(json: string) {
    try {
      const backup = parseBackupJson(json);
      const nextLibrary: MoveLedgerLibrary = {
        savedGames: backup.savedGames,
        activeGameId: backup.activeGameId,
      };
      const nextGame =
        (backup.activeGameId ? loadSavedGame(nextLibrary, backup.activeGameId) : null) ??
        backup.savedGames[0] ??
        createEmptyGame();

      setLibrary(nextLibrary);
      setCards(backup.mistakeCards);
      setGame(nextGame);
      setCurrentPly(nextGame.moves.length);
      setSelectedCardId(backup.mistakeCards[0]?.id ?? null);
      setRevealedCardId(null);
      setAttemptResult(null);
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : "Could not import that backup.";
    }
  }

  return (
    <main className="min-h-screen bg-[#11110f] text-stone-100">
      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <header className="grid gap-2 border-b border-stone-800 pb-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-3xl font-semibold tracking-normal text-amber-100">
                LineForge
              </h1>
              <p className="max-w-3xl text-sm text-stone-400">
                A private chess memory system for importing games, marking your thinking,
                saving mistake cards, and reviewing recurring weaknesses.
              </p>
            </div>
            <div className="rounded-md border border-stone-800 px-3 py-2 text-xs text-stone-500">
              Local-first · no accounts · no engine · {game.name}
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span
              className={`rounded-md border px-3 py-1 ${
                isDraftGame
                  ? "border-sky-800 bg-sky-950/60 text-sky-200"
                  : hasDirtyGame
                    ? "border-amber-800 bg-amber-950/60 text-amber-100"
                    : "border-emerald-900 bg-emerald-950/50 text-emerald-200"
              }`}
            >
              {isDraftGame
                ? "Draft game"
                : hasDirtyGame
                  ? "Unsaved changes"
                  : "Saved"}
            </span>
            {storageMessages.map((message) => (
              <span
                key={message}
                className="rounded-md border border-red-900 bg-red-950/60 px-3 py-1 text-red-100"
              >
                {message}
              </span>
            ))}
          </div>
        </header>

        <div className="grid gap-6 xl:grid-cols-[minmax(360px,520px)_1fr]">
          <ChessBoardPanel
            fen={replayChess.fen()}
            game={game}
            currentPly={currentPly}
            onDrop={handleDrop}
            onGoToPly={goToPly}
            onUndo={handleUndo}
            onReset={handleReset}
          />

          <div className="grid gap-6">
            <GameLibraryPanel
              key={game.id}
              activeGame={game}
              library={library}
              isDraftGame={isDraftGame}
              hasUnsavedChanges={hasDirtyGame}
              onSaveGame={handleSaveGame}
              onRenameSavedGame={handleRenameSavedGame}
              onUpdateDraftName={handleUpdateDraftName}
              onReloadSavedGame={handleReloadSavedGame}
              onLoadGame={handleLoadGame}
              onDeleteGame={handleDeleteGame}
            />
            <GameImportPanel
              game={game}
              fen={replayChess.fen()}
              pgn={replayChess.pgn()}
              hasUnsavedChanges={hasDirtyGame}
              onPreviewPgn={handlePreviewPgn}
              onConfirmImport={handleConfirmImport}
              onCancelImport={handleCancelImport}
              onGoToPly={goToPly}
            />
            <MoveAnnotationPanel
              game={game}
              currentPly={currentPly}
              comparisonLensIds={comparisonLensIds}
              onComparisonLensIdsChange={handleComparisonLensIdsChange}
              onSaveAnnotation={handleSaveAnnotation}
              onCreateCard={handleCreateCard}
            />
            <EngineAnalysisPanel
              activeFen={replayChess.fen()}
              canAttachToAnnotation={currentPly > 0}
              currentAnnotationAnalysis={currentAnnotation?.engineAnalysis}
              selectedCard={selectedCard}
              onAttachToAnnotation={handleAttachAnalysisToAnnotation}
              onAttachToCard={handleAttachAnalysisToCard}
            />
          </div>
        </div>

        <MistakeDashboard
          stats={stats}
          sessionSummaries={sessionSummaries}
          openingMap={openingMap}
          openingTrend={openingTrend}
        />
        <ReviewSessionPanel
          cards={cards}
          comparisonLensIds={comparisonLensIds}
          sessionSummaries={sessionSummaries}
          openingMap={openingMap}
          openingTrend={openingTrend}
          activeGameId={isDraftGame ? null : game.id}
          onRecordCardReview={handleSessionCardReview}
          onCompleteSession={handleCompleteSession}
          onClearSessionHistory={handleClearSessionHistory}
        />
        <DrillQueuePanel
          cards={cards}
          activeGameId={game.id}
          activeGameName={game.name}
          sourceGameNames={sourceGameNames}
          comparisonLensIds={comparisonLensIds}
          onComparisonLensIdsChange={handleComparisonLensIdsChange}
          selectedCardId={selectedCard?.id ?? null}
          revealed={selectedCard ? revealedCardId === selectedCard.id : false}
          onSelectCard={handleSelectCard}
          onReveal={() => selectedCard && setRevealedCardId(selectedCard.id)}
          onReview={handleReview}
          onAttemptMove={handleAttemptMove}
          attemptResult={
            selectedCard && revealedCardId === selectedCard.id ? attemptResult : null
          }
        />
        <BackupPanel onExport={handleExportBackup} onImport={handleImportBackup} />
      </div>
    </main>
  );
}

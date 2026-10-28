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
  evaluateDrillSan,
} from "@/lib/drill-queue/review";
import {
  clearReviewSessionSummaries,
  loadReviewSessionSummaries,
  saveReviewSessionSummary,
  type ReviewSessionSummary,
} from "@/lib/drill-queue/session";
import {
  getDefaultReviewSchedulePreferences,
  loadReviewSchedulePreferences,
  saveReviewSchedulePreferences,
  type ReviewScheduleIntervalPreset,
  type ReviewSchedulePreferences,
} from "@/lib/drill-queue/schedule-preferences";
import { buildReviewSchedule } from "@/lib/drill-queue/schedule";
import {
  attachAnalysisToAnnotation,
  attachAnalysisToCard,
} from "@/lib/engine/local-engine";
import type { EngineAnalysisResult } from "@/lib/engine/types";
import type { CorrectionInput } from "@/lib/mistake-graph/correction";
import { createMistakeCard } from "@/lib/mistake-graph/cards";
import { buildOpeningWeaknessMap } from "@/lib/mistake-graph/opening-weakness-map";
import { buildOpeningWeaknessTrend } from "@/lib/mistake-graph/opening-weakness-trends";
import { calculateMistakeStats } from "@/lib/mistake-graph/stats";
import { emptyAnnotation } from "@/lib/move-ledger/annotations";
import { createBackup, parseBackupJson, serializeBackup } from "@/lib/move-ledger/backup";
import {
  createEmptyGame,
  createGameFromChess,
  loadGameAtPly,
  shouldWarnBeforeReplacingGame,
  tryMove,
} from "@/lib/move-ledger/game";
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
  saveStudyData,
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

const WORKFLOW_SECTIONS = [
  {
    id: "play",
    label: "Play",
    description: "Board, game library, and PGN import.",
  },
  {
    id: "study",
    label: "Study",
    description: "Annotate moves and attach optional local analysis.",
  },
  {
    id: "review",
    label: "Review",
    description: "Drill cards, sessions, schedule, and history.",
  },
  {
    id: "weaknesses",
    label: "Weaknesses",
    description: "MistakeGraph dashboard, opening map, and trends.",
  },
  {
    id: "data",
    label: "Data",
    description: "Backup/export and local data boundaries.",
  },
] as const;

type WorkflowSection = (typeof WORKFLOW_SECTIONS)[number]["id"];

export function LineForgeApp() {
  const [game, setGame] = useState<LineForgeGame>(() => createEmptyGame());
  const [library, setLibrary] = useState<MoveLedgerLibrary>(() => createEmptyLibrary());
  const [cards, setCards] = useState<MistakeCard[]>([]);
  const [currentPly, setCurrentPly] = useState(0);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [revealedCardId, setRevealedCardId] = useState<string | null>(null);
  const [reviewSessionActive, setReviewSessionActive] = useState(false);
  const [attemptResult, setAttemptResult] = useState<DrillAttemptResult | null>(null);
  const [sessionSummaries, setSessionSummaries] = useState<ReviewSessionSummary[]>([]);
  const [comparisonLensIds, setComparisonLensIds] = useState<CoachLensId[]>(
    DEFAULT_COACH_LENS_COMPARISON_IDS,
  );
  const [schedulePreferences, setSchedulePreferences] = useState<ReviewSchedulePreferences>(
    () => getDefaultReviewSchedulePreferences(),
  );
  const [activeWorkflow, setActiveWorkflow] = useState<WorkflowSection>("play");
  const [storageMessages, setStorageMessages] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [saveAttempt, setSaveAttempt] = useState(0);
  const [localSave, setLocalSave] = useState<{
    game: LineForgeGame; library: MoveLedgerLibrary; cards: MistakeCard[];
    attempt: number; saved: boolean;
  } | null>(null);
  const saveIsCurrent = localSave?.game === game && localSave?.library === library &&
    localSave?.cards === cards && localSave?.attempt === saveAttempt;

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
      setSchedulePreferences(loadReviewSchedulePreferences());
      setStorageMessages(consumeStorageWarnings().map((warning) => warning.message));
      setHydrated(true);
    });
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const result = saveStudyData(game, library, cards);
    let active = true;
    queueMicrotask(() => {
      if (active) setLocalSave({ game, library, cards, attempt: saveAttempt, saved: result.saved });
    });
    return () => { active = false; };
  }, [game, library, cards, hydrated, saveAttempt]);

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
  const reviewSchedule = useMemo(
    () => buildReviewSchedule(cards, sessionSummaries, openingMap, schedulePreferences),
    [cards, openingMap, schedulePreferences, sessionSummaries],
  );
  const isDraftGame = !isGameSaved(library, game.id);
  const hasDirtyGame = hasUnsavedChanges(library, game);
  const shouldWarnOnImport = shouldWarnBeforeReplacingGame({
    game,
    isDraftGame,
    hasUnsavedChanges: hasDirtyGame,
  });
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
    const result = parsePgnImportPreview(pgn, shouldWarnOnImport);

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
      name: name.trim() || "Untitled game",
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

  function handleCreateCard(correction?: CorrectionInput) {
    const card = createMistakeCard(game, currentPly, game.annotations[currentPly], correction);

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

  function handleSessionCardReview(cardId: string, result: ReviewResult, played?: DrillAttemptResult) {
    setCards((currentCards) =>
      currentCards.map((card) => {
        if (card.id !== cardId) {
          return card;
        }

        return appendDrillAttempt(
          card,
          createDrillAttempt(card, result, played ? "played" : "manual-reveal", played?.attemptedSan, played?.attemptedFenAfter),
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
    targetSquare: string = "",
  ) {
    const result = targetSquare ? evaluateDrillMove(card, sourceSquare, targetSquare) : evaluateDrillSan(card, sourceSquare);
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

  function handleSchedulePresetChange(preset: ReviewScheduleIntervalPreset) {
    setSchedulePreferences(saveReviewSchedulePreferences(preset));
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
    <main className="min-h-screen bg-paper text-ink">
      <div className="mx-auto grid max-w-7xl gap-4 px-3 py-4 sm:gap-6 sm:px-6 sm:py-6 lg:px-8">
        <header className="grid gap-2 border-b border-ink pb-4 sm:pb-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold tracking-normal text-ink sm:text-3xl">
                LineForge
              </h1>
              <p className="max-w-3xl text-sm text-ink-muted">
                A private chess memory system for importing games, marking your thinking,
                saving mistake cards, and reviewing recurring weaknesses.
              </p>
            </div>
            <div className="max-w-full border-[1.5px] border-ink px-3 py-2 text-xs text-ink-muted">
              Local-first · no accounts · optional local engine
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span
              className={`border-[1.5px] px-3 py-1 ${
                isDraftGame
                  ? "border-dotted border-data border-l-[6px] bg-data-tint text-ink"
                  : hasDirtyGame
                    ? "border-dashed border-spot bg-spot-tint text-ink"
                    : "border-data border-l-[6px] bg-data-tint text-data"
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
                className="border-[1.5px] border-spot border-l-[6px] bg-spot-tint px-3 py-1 text-ink"
                role="alert"
              >
                {message}
              </span>
            ))}
          </div>
          <div aria-label="Local study data save status" className="text-sm">
            <p role={saveIsCurrent && !localSave?.saved ? "alert" : "status"}>
              {!hydrated ? "Loading local study data…" : !saveIsCurrent ? "Saving study data locally…" :
                localSave?.saved ? "Study data saved locally in this browser." :
                "Study data not fully saved. Keep this tab open and export a backup from Data. Some local records may have saved; reloading could restore a mixed or older set."}
            </p>
            {saveIsCurrent && !localSave?.saved && (
              <button className="lf-button-secondary mt-2" onClick={() => setSaveAttempt((attempt) => attempt + 1)}>
                Retry local save
              </button>
            )}
          </div>
          <nav
            className="-mx-3 mt-2 flex gap-2 overflow-x-auto px-3 pb-2 sm:mx-0 sm:px-0"
            aria-label="LineForge workflows"
          >
            {WORKFLOW_SECTIONS.map((section) => {
              const isActive = activeWorkflow === section.id;

              return (
                <button
                  key={section.id}
                  className={`min-h-10 min-w-[5.75rem] shrink-0 border-[1.5px] px-2.5 py-1.5 text-left text-sm transition md:min-w-28 md:px-3 md:py-2 ${
                    isActive
                      ? "border-dashed border-spot bg-spot-tint text-ink"
                      : "border-ink bg-paper text-ink-muted hover:border-spot hover:text-ink"
                  }`}
                  type="button"
                  aria-current={isActive ? "page" : undefined}
                  aria-pressed={isActive}
                  aria-label={`${section.label}: ${section.description}`}
                  onClick={() => setActiveWorkflow(section.id)}
                >
                  <span className="block font-medium">{section.label}</span>
                  <span className="hidden text-xs text-ink-muted lg:block">{section.description}</span>
                </button>
              );
            })}
          </nav>
        </header>

        <div className={`grid gap-4 sm:gap-6 xl:items-start ${activeWorkflow === "review" ? "" : "xl:grid-cols-[minmax(340px,520px)_minmax(0,1fr)]"}`}>
          <div hidden={activeWorkflow === "review"} className="xl:sticky xl:top-4">
            <ChessBoardPanel
              fen={replayChess.fen()}
              game={game}
              currentPly={currentPly}
              onDrop={handleDrop}
              onGoToPly={goToPly}
              onUndo={handleUndo}
              onReset={handleReset}
            />
          </div>

          <section className="min-w-0" aria-label="Selected workflow">
            <div
              className="grid gap-4"
              hidden={activeWorkflow !== "play"}
              aria-labelledby="lineforge-workflow-play"
            >
              <WorkflowHeading sectionId="play" />
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
                hasUnsavedChanges={shouldWarnOnImport}
                onPreviewPgn={handlePreviewPgn}
                onConfirmImport={handleConfirmImport}
                onCancelImport={handleCancelImport}
                onGoToPly={goToPly}
              />
            </div>

            <div
              className="grid gap-4"
              hidden={activeWorkflow !== "study"}
              aria-labelledby="lineforge-workflow-study"
            >
              <WorkflowHeading sectionId="study" />
              <MoveAnnotationPanel
                key={`${game.id}-${currentPly}`}
                game={game}
                currentPly={currentPly}
                comparisonLensIds={comparisonLensIds}
                onComparisonLensIdsChange={handleComparisonLensIdsChange}
                onSaveAnnotation={handleSaveAnnotation}
                onCreateCard={handleCreateCard}
              />
              <details className="border-[1.5px] border-ink bg-paper-2 p-3 sm:p-4">
                <summary className="cursor-pointer text-sm font-medium text-ink">
                  Optional local engine analysis
                </summary>
                <div className="mt-4">
                  <EngineAnalysisPanel
                    activeFen={replayChess.fen()}
                    canAttachToAnnotation={currentPly > 0}
                    currentAnnotationAnalysis={currentAnnotation?.engineAnalysis}
                    selectedCard={selectedCard}
                    onAttachToAnnotation={handleAttachAnalysisToAnnotation}
                    onAttachToCard={handleAttachAnalysisToCard}
                  />
                </div>
              </details>
            </div>

            <div
              className="grid gap-4"
              hidden={activeWorkflow !== "review" && activeWorkflow !== "weaknesses"}
              aria-labelledby={`lineforge-workflow-${activeWorkflow === "weaknesses" ? "weaknesses" : "review"}`}
            >
              <WorkflowHeading sectionId={activeWorkflow === "weaknesses" ? "weaknesses" : "review"} />
              {activeWorkflow === "review" ? (
                <div hidden={reviewSessionActive}><DrillQueuePanel
                  cards={cards}
                  activeGameId={game.id}
                  activeGameName={game.name}
                  sourceGameNames={sourceGameNames}
                  reviewSchedule={reviewSchedule}
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
                </div>
              ) : (
                <MistakeDashboard
                  stats={stats}
                  sessionSummaries={sessionSummaries}
                  openingMap={openingMap}
                  openingTrend={openingTrend}
                  reviewSchedule={reviewSchedule}
                />
              )}
              <ReviewSessionPanel
                onSessionActiveChange={active => {
                  setReviewSessionActive(active);
                  if (active) { setRevealedCardId(null); setAttemptResult(null); }
                }}
                cards={cards}
                comparisonLensIds={comparisonLensIds}
                sessionSummaries={sessionSummaries}
                reviewSchedule={reviewSchedule}
                schedulePreferences={schedulePreferences}
                onSchedulePresetChange={handleSchedulePresetChange}
                displayMode={activeWorkflow === "weaknesses" ? "weaknesses" : "review"}
                openingMap={openingMap}
                openingTrend={openingTrend}
                activeGameId={isDraftGame ? null : game.id}
                onRecordCardReview={handleSessionCardReview}
                onCompleteSession={handleCompleteSession}
                onClearSessionHistory={handleClearSessionHistory}
                onRequestReviewView={() => setActiveWorkflow("review")}
              />
            </div>

            <div
              className="grid gap-4"
              hidden={activeWorkflow !== "data"}
              aria-labelledby="lineforge-workflow-data"
            >
              <WorkflowHeading sectionId="data" />
              <section className="border-[1.5px] border-ink bg-paper-2 p-3 sm:p-4">
                <h2 className="text-lg font-semibold text-ink">Local data</h2>
                <p className="mt-1 text-sm text-ink-muted">
                  LineForge stores study data in this browser, exports local JSON backups,
                  and does not use accounts, cloud sync, or external services.
                </p>
              </section>
              <details className="border-[1.5px] border-ink bg-paper-2 p-3 sm:p-4">
                <summary className="cursor-pointer text-sm font-medium text-ink">
                  Backup and JSON export tools
                </summary>
                <div className="mt-4">
                  <BackupPanel onExport={handleExportBackup} onImport={handleImportBackup} />
                </div>
              </details>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

function WorkflowHeading({ sectionId }: { sectionId: WorkflowSection }) {
  const section = WORKFLOW_SECTIONS.find((item) => item.id === sectionId);

  if (!section) {
    return null;
  }

  return (
    <div className="border-[1.5px] border-ink bg-paper-2 p-3 sm:p-4">
      <h2 id={`lineforge-workflow-${section.id}`} className="text-lg font-semibold text-ink sm:text-xl">
        {section.label}
      </h2>
      <p className="mt-1 text-sm text-ink-muted">{section.description}</p>
    </div>
  );
}

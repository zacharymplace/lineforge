"use client";

import type { CorrectionInput } from "@/lib/mistake-graph/correction";
import { useState } from "react";
import {
  DEFAULT_COACH_LENS_ID,
  buildCoachLensComparisonOutputs,
  buildCoachLensOutput,
} from "@/lib/coach-lenses/lenses";
import type { CoachLensId, CoachLensInput } from "@/lib/coach-lenses/types";
import { MISTAKE_TAGS, MOVE_VERDICTS, type LineForgeGame } from "@/lib/move-ledger/types";
import type { MistakeCard, MoveAnnotation, MistakeTag, MoveVerdict } from "@/lib/move-ledger/types";
import { emptyAnnotation, toggleTag } from "@/lib/move-ledger/annotations";
import {
  formatAnalysisTimestamp,
  formatEvaluation,
  getStoredAnalysisLabel,
} from "@/lib/engine/local-engine";
import { buildExplanationSummary } from "@/lib/explanations/templates";
import { buildMoveReviewPacket } from "@/lib/review-packets/build";
import type { ReviewPacket } from "@/lib/review-packets/types";
import { CoachLensComparison } from "./CoachLensComparison";
import { CoachLensPanel } from "./CoachLensPanel";
import { ReviewPacketPreviewModal } from "./ReviewPacketPreviewModal";
import { ReviewSummary } from "./ReviewSummary";

type MoveAnnotationPanelProps = {
  game: LineForgeGame;
  currentPly: number;
  comparisonLensIds: CoachLensId[];
  onComparisonLensIdsChange: (lensIds: CoachLensId[]) => void;
  onSaveAnnotation: (annotation: MoveAnnotation) => void;
  onCreateCard: (correction?: CorrectionInput) => MistakeCard | null;
};

export function MoveAnnotationPanel({
  game,
  currentPly,
  comparisonLensIds,
  onComparisonLensIdsChange,
  onSaveAnnotation,
  onCreateCard,
}: MoveAnnotationPanelProps) {
  const move = currentPly > 0 ? game.moves[currentPly - 1] : null;
  const annotation = game.annotations[currentPly] ?? emptyAnnotation(currentPly);
  const [correction, setCorrection] = useState<CorrectionInput>({ move: "", reason: "", source: "" });
  const [cardMessage, setCardMessage] = useState("");
  const [previewPacket, setPreviewPacket] = useState<ReviewPacket | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [selectedLensId, setSelectedLensId] = useState<CoachLensId>(DEFAULT_COACH_LENS_ID);
  const [showLensComparison, setShowLensComparison] = useState(false);
  const coachLensInput: CoachLensInput = {
    moveSan: move?.san,
    ply: move ? currentPly : undefined,
    fenBefore: move?.before,
    fenAfter: move?.after,
    verdict: move ? annotation.verdict : undefined,
    tags: move ? annotation.tags : [],
    userNote: move ? annotation.thought : undefined,
    engineAnalysis: annotation.engineAnalysis,
  };

  function updateAnnotation(update: Partial<MoveAnnotation>) {
    onSaveAnnotation({
      ...annotation,
      ...update,
      ply: currentPly,
      updatedAt: new Date().toISOString(),
    });
  }

  function handlePreviewPacket() {
    if (!move) {
      return;
    }

    try {
      setPreviewPacket(
        buildMoveReviewPacket({
          sourceGameId: game.id,
          sourceGameName: game.name,
          ply: currentPly,
          fenBefore: move.before,
          fenAfter: move.after,
          moveSan: move.san,
          annotation,
          coachLens: buildCoachLensOutput(selectedLensId, coachLensInput),
          comparedCoachLenses: showLensComparison
            ? buildCoachLensComparisonOutputs(comparisonLensIds, coachLensInput)
            : undefined,
        }),
      );
      setExportError(null);
    } catch (error) {
      setPreviewPacket(null);
      setExportError(
        error instanceof Error ? error.message : "Could not generate that review packet.",
      );
    }
  }

  return (
    <section className="grid gap-4 border-[1.5px] border-ink bg-paper-2 p-4">
      <div>
        <h2 className="text-lg font-semibold text-ink">Move annotation</h2>
        <p className="text-sm text-ink-muted">
          {move ? `Ply ${currentPly}: ${move.san}` : "Select or play a move to annotate it."}
        </p>
      </div>

      <textarea
        className="lf-field min-h-28 resize-y"
        disabled={!move}
        placeholder="What I thought was happening"
        value={move ? annotation.thought : ""}
        onChange={(event) => updateAnnotation({ thought: event.target.value })}
      />

      <div className="grid gap-2">
        <div className="text-sm text-ink-muted">Verdict</div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {MOVE_VERDICTS.map((verdict) => (
            <button
              key={verdict}
              disabled={!move}
              className={annotation.verdict === verdict ? "lf-chip-active" : "lf-chip"}
              onClick={() => updateAnnotation({ verdict: verdict as MoveVerdict })}
            >
              {verdict}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-2">
        <div className="text-sm text-ink-muted">Tags</div>
        <div className="flex flex-wrap gap-2">
          {MISTAKE_TAGS.map((tag) => (
            <button
              key={tag}
              disabled={!move}
              className={annotation.tags.includes(tag) ? "lf-chip-active" : "lf-chip"}
              onClick={() =>
                updateAnnotation({ tags: toggleTag(annotation.tags, tag as MistakeTag) })
              }
            >
              {tag}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button className="lf-button-primary" disabled={!move} onClick={() => onCreateCard()}>
          Create game-recall card
        </button>
        <button className="lf-button" disabled={!move} onClick={handlePreviewPacket}>
          Export move packet
        </button>
      </div>
      <form className="grid gap-3 border-[1.5px] border-ink p-3" onSubmit={event => {
        event.preventDefault();
        try {
          if (onCreateCard(correction)) {
            setCardMessage("Correction card saved. Open Review to practice it.");
            setCorrection({ move: "", reason: "", source: "" });
          }
        } catch (error) { setCardMessage(error instanceof Error ? error.message : "Could not create correction card."); }
      }}>
        <h3 className="font-semibold">Create correction card</h3>
        <p className="text-sm text-ink-muted">Save an alternative to the played move and explain why you prefer it. Legality is checked; this is your study target, not a claim of the best move.</p>
        <label>Alternative move<input className="lf-field w-full" required disabled={!move} value={correction.move} onChange={event => setCorrection({ ...correction, move: event.target.value })} placeholder="Qe7" /></label>
        <label>Why this correction<textarea className="lf-field w-full" required disabled={!move} value={correction.reason} onChange={event => setCorrection({ ...correction, reason: event.target.value })} /></label>
        <label>Source<input className="lf-field w-full" required disabled={!move} value={correction.source} onChange={event => setCorrection({ ...correction, source: event.target.value })} placeholder="Your analysis, coach, or analysis reference" /></label>
        <button className="lf-button-primary" disabled={!move}>Save correction card</button>
        <p role="status">{cardMessage}</p>
      </form>
      {exportError ? (
        <div
          className="border-[1.5px] border-spot border-l-[6px] bg-spot-tint p-3 text-sm text-ink"
          role="alert"
        >
          {exportError}
        </div>
      ) : null}

      {move ? (
        <CoachLensPanel
          input={coachLensInput}
          selectedLensId={selectedLensId}
          onSelectLens={setSelectedLensId}
        />
      ) : null}

      {move ? (
        <div className="grid gap-3">
          <button
            className="lf-button w-fit"
            onClick={() => setShowLensComparison((current) => !current)}
          >
            {showLensComparison ? "Hide lens comparison" : "Compare lenses"}
          </button>
          {showLensComparison ? (
            <CoachLensComparison
              input={coachLensInput}
              selectedLensIds={comparisonLensIds}
              onSelectedLensIdsChange={onComparisonLensIdsChange}
            />
          ) : null}
        </div>
      ) : null}

      {annotation.engineAnalysis ? (
        <div className="grid gap-3">
          <div className="grid gap-1 bg-paper-2 p-3 text-sm">
            <div className="text-ink-muted">{getStoredAnalysisLabel("move")}</div>
            <div className="font-mono text-ink">
              {annotation.engineAnalysis.bestMoveSan ?? annotation.engineAnalysis.bestMoveUci} ·{" "}
              {formatEvaluation(annotation.engineAnalysis.evaluation)}
            </div>
            <div className="text-xs text-ink-muted">
              Analyzed {formatAnalysisTimestamp(annotation.engineAnalysis.analyzedAt)}
            </div>
          </div>
          <ReviewSummary
            summary={buildExplanationSummary({
              moveSan: move?.san,
              verdict: annotation.verdict,
              tags: annotation.tags,
              userNote: annotation.thought,
              engineAnalysis: annotation.engineAnalysis,
            })}
          />
        </div>
      ) : null}

      {previewPacket ? (
        <ReviewPacketPreviewModal
          packet={previewPacket}
          onClose={() => setPreviewPacket(null)}
        />
      ) : null}
    </section>
  );
}

"use client";

import { useState } from "react";
import { DEFAULT_COACH_LENS_ID, buildCoachLensOutput } from "@/lib/coach-lenses/lenses";
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
import { CoachLensPanel } from "./CoachLensPanel";
import { ReviewPacketPreviewModal } from "./ReviewPacketPreviewModal";
import { ReviewSummary } from "./ReviewSummary";

type MoveAnnotationPanelProps = {
  game: LineForgeGame;
  currentPly: number;
  onSaveAnnotation: (annotation: MoveAnnotation) => void;
  onCreateCard: () => MistakeCard | null;
};

export function MoveAnnotationPanel({
  game,
  currentPly,
  onSaveAnnotation,
  onCreateCard,
}: MoveAnnotationPanelProps) {
  const move = currentPly > 0 ? game.moves[currentPly - 1] : null;
  const annotation = game.annotations[currentPly] ?? emptyAnnotation(currentPly);
  const [previewPacket, setPreviewPacket] = useState<ReviewPacket | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [selectedLensId, setSelectedLensId] = useState<CoachLensId>(DEFAULT_COACH_LENS_ID);
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
    <section className="grid gap-4 rounded-lg border border-stone-800 bg-stone-950/80 p-4">
      <div>
        <h2 className="text-lg font-semibold text-stone-100">Move annotation</h2>
        <p className="text-sm text-stone-500">
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
        <div className="text-sm text-stone-500">Verdict</div>
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
        <div className="text-sm text-stone-500">Tags</div>
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
        <button className="lf-button-primary" disabled={!move} onClick={onCreateCard}>
          Create mistake card
        </button>
        <button className="lf-button" disabled={!move} onClick={handlePreviewPacket}>
          Export move packet
        </button>
      </div>
      {exportError ? (
        <div className="rounded-md border border-red-900 bg-red-950/60 p-3 text-sm text-red-100">
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

      {annotation.engineAnalysis ? (
        <div className="grid gap-3">
          <div className="grid gap-1 rounded-md bg-black/30 p-3 text-sm">
            <div className="text-stone-500">{getStoredAnalysisLabel("move")}</div>
            <div className="font-mono text-amber-100">
              {annotation.engineAnalysis.bestMoveSan ?? annotation.engineAnalysis.bestMoveUci} ·{" "}
              {formatEvaluation(annotation.engineAnalysis.evaluation)}
            </div>
            <div className="text-xs text-stone-500">
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

"use client";

import { MISTAKE_TAGS, MOVE_VERDICTS, type LineForgeGame } from "@/lib/move-ledger/types";
import type { MistakeCard, MoveAnnotation, MistakeTag, MoveVerdict } from "@/lib/move-ledger/types";
import { emptyAnnotation, toggleTag } from "@/lib/move-ledger/annotations";
import {
  formatAnalysisTimestamp,
  formatEvaluation,
  getStoredAnalysisLabel,
} from "@/lib/engine/local-engine";

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

  function updateAnnotation(update: Partial<MoveAnnotation>) {
    onSaveAnnotation({
      ...annotation,
      ...update,
      ply: currentPly,
      updatedAt: new Date().toISOString(),
    });
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

      <button className="lf-button-primary" disabled={!move} onClick={onCreateCard}>
        Create mistake card
      </button>

      {annotation.engineAnalysis ? (
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
      ) : null}
    </section>
  );
}

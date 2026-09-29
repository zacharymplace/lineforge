"use client";

import {
  COACH_LENSES,
  MAX_COACH_LENS_COMPARISON,
  buildCoachLensComparisonOutputs,
  normalizeCoachLensComparisonSelection,
} from "@/lib/coach-lenses/lenses";
import type { CoachLensId, CoachLensInput } from "@/lib/coach-lenses/types";

type CoachLensComparisonProps = {
  input: CoachLensInput;
  selectedLensIds: CoachLensId[];
  onSelectedLensIdsChange: (lensIds: CoachLensId[]) => void;
};

const confidenceClass = {
  low: "border-ink bg-paper-3 text-ink-2",
  medium: "border-dashed border-spot bg-spot-tint text-ink",
  high: "border-data border-l-[6px] bg-data-tint text-data",
};

export function CoachLensComparison({
  input,
  selectedLensIds,
  onSelectedLensIdsChange,
}: CoachLensComparisonProps) {
  const outputs = buildCoachLensComparisonOutputs(selectedLensIds, input);

  function toggleLens(lensId: CoachLensId) {
    onSelectedLensIdsChange(
      normalizeCoachLensComparisonSelection(selectedLensIds, lensId),
    );
  }

  return (
    <div className="grid gap-3 bg-paper-2 p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="font-medium text-ink">Compare lenses</div>
          <div className="text-xs text-ink-muted">
            Choose up to {MAX_COACH_LENS_COMPARISON} deterministic perspectives.
          </div>
        </div>
        <div className="text-xs text-ink-muted">
          {selectedLensIds.length}/{MAX_COACH_LENS_COMPARISON} selected
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {COACH_LENSES.map((lens) => (
          <label
            key={lens.id}
            className={
              selectedLensIds.includes(lens.id)
                ? "lf-chip-active cursor-pointer"
                : "lf-chip cursor-pointer"
            }
          >
            <input
              className="sr-only"
              type="checkbox"
              checked={selectedLensIds.includes(lens.id)}
              onChange={() => toggleLens(lens.id)}
            />
            {lens.label}
          </label>
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        {outputs.map((output) => (
          <div
            key={output.lensId}
            className="grid content-start gap-2 border-[1.5px] border-ink bg-paper p-3"
          >
            <div className="flex flex-wrap items-center gap-2">
              <div className="font-semibold text-ink">{output.title}</div>
              <span
                className={`border-[1.5px] px-2 py-0.5 text-xs ${confidenceClass[output.confidence]}`}
              >
                {output.confidence}
              </span>
            </div>
            <p className="text-ink-2">{output.summary}</p>
            <div className="grid gap-1 text-ink-2">
              {output.points.slice(0, 3).map((point) => (
                <div key={point.id}>{point.text}</div>
              ))}
            </div>
            <div className="border-[1.5px] border-ink bg-paper-2 p-2 text-ink-2">
              <span className="text-ink-muted">Next: </span>
              {output.recommendedNextAction}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

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
  low: "border-stone-700 bg-stone-900 text-stone-300",
  medium: "border-amber-800 bg-amber-950/60 text-amber-100",
  high: "border-emerald-900 bg-emerald-950/60 text-emerald-200",
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
    <div className="grid gap-3 rounded-md bg-black/30 p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="font-medium text-stone-100">Compare lenses</div>
          <div className="text-xs text-stone-500">
            Choose up to {MAX_COACH_LENS_COMPARISON} deterministic perspectives.
          </div>
        </div>
        <div className="text-xs text-stone-500">
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
            className="grid content-start gap-2 rounded-md border border-stone-800 bg-stone-950 p-3"
          >
            <div className="flex flex-wrap items-center gap-2">
              <div className="font-semibold text-amber-100">{output.title}</div>
              <span
                className={`rounded-md border px-2 py-0.5 text-xs ${confidenceClass[output.confidence]}`}
              >
                {output.confidence}
              </span>
            </div>
            <p className="text-stone-300">{output.summary}</p>
            <div className="grid gap-1 text-stone-300">
              {output.points.slice(0, 3).map((point) => (
                <div key={point.id}>{point.text}</div>
              ))}
            </div>
            <div className="rounded-md border border-stone-800 bg-black/30 p-2 text-stone-200">
              <span className="text-stone-500">Next: </span>
              {output.recommendedNextAction}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

"use client";

import { COACH_LENSES, buildCoachLensOutput } from "@/lib/coach-lenses/lenses";
import type { CoachLensId, CoachLensInput } from "@/lib/coach-lenses/types";

type CoachLensPanelProps = {
  input: CoachLensInput;
  selectedLensId: CoachLensId;
  onSelectLens: (lensId: CoachLensId) => void;
};

const confidenceClass = {
  low: "border-stone-700 bg-stone-900 text-stone-300",
  medium: "border-amber-800 bg-amber-950/60 text-amber-100",
  high: "border-emerald-900 bg-emerald-950/60 text-emerald-200",
};

export function CoachLensPanel({
  input,
  selectedLensId,
  onSelectLens,
}: CoachLensPanelProps) {
  const output = buildCoachLensOutput(selectedLensId, input);

  return (
    <div className="grid gap-3 rounded-md bg-black/30 p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-medium text-stone-100">Coach lens</div>
        <select
          className="lf-field w-auto min-w-48 py-1 text-sm"
          value={selectedLensId}
          onChange={(event) => onSelectLens(event.target.value as CoachLensId)}
        >
          {COACH_LENSES.map((lens) => (
            <option key={lens.id} value={lens.id}>
              {lens.label}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="font-semibold text-amber-100">{output.title}</div>
          <span
            className={`rounded-md border px-2 py-0.5 text-xs ${confidenceClass[output.confidence]}`}
          >
            {output.confidence} confidence
          </span>
        </div>
        <p className="text-stone-300">{output.summary}</p>
        <div className="grid gap-1">
          {output.points.map((point) => (
            <div key={point.id} className="text-stone-300">
              {point.text}
            </div>
          ))}
        </div>
        <div className="rounded-md border border-stone-800 bg-stone-950 p-2 text-stone-200">
          <span className="text-stone-500">Next action: </span>
          {output.recommendedNextAction}
        </div>
      </div>
    </div>
  );
}

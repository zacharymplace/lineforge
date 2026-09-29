"use client";

import { COACH_LENSES, buildCoachLensOutput } from "@/lib/coach-lenses/lenses";
import type { CoachLensId, CoachLensInput } from "@/lib/coach-lenses/types";

type CoachLensPanelProps = {
  input: CoachLensInput;
  selectedLensId: CoachLensId;
  onSelectLens: (lensId: CoachLensId) => void;
};

const confidenceClass = {
  low: "border-ink bg-paper-3 text-ink-2",
  medium: "border-dashed border-spot bg-spot-tint text-ink",
  high: "border-data border-l-[6px] bg-data-tint text-data",
};

export function CoachLensPanel({
  input,
  selectedLensId,
  onSelectLens,
}: CoachLensPanelProps) {
  const output = buildCoachLensOutput(selectedLensId, input);

  return (
    <div className="grid gap-3 bg-paper-2 p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-medium text-ink">Coach lens</div>
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
          <div className="font-semibold text-ink">{output.title}</div>
          <span
            className={`border-[1.5px] px-2 py-0.5 text-xs ${confidenceClass[output.confidence]}`}
          >
            {output.confidence} confidence
          </span>
        </div>
        <p className="text-ink-2">{output.summary}</p>
        <div className="grid gap-1">
          {output.points.map((point) => (
            <div key={point.id} className="text-ink-2">
              {point.text}
            </div>
          ))}
        </div>
        <div className="border-[1.5px] border-ink bg-paper p-2 text-ink-2">
          <span className="text-ink-muted">Next action: </span>
          {output.recommendedNextAction}
        </div>
      </div>
    </div>
  );
}

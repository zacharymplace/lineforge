"use client";

import type { ExplanationSummary } from "@/lib/explanations/types";

type ReviewSummaryProps = {
  summary: ExplanationSummary;
  heading?: string;
};

const severityClass = {
  info: "text-ink-2",
  positive: "text-data",
  warning: "text-ink",
  critical: "text-ink font-bold underline decoration-spot decoration-2 underline-offset-2",
};

export function ReviewSummary({ summary, heading = "Review summary" }: ReviewSummaryProps) {
  return (
    <div className="grid gap-2 bg-paper-2 p-3 text-sm">
      <div className="font-medium text-ink">{heading || summary.title}</div>
      <div className="grid gap-1">
        {summary.points.map((point) => (
          <div key={point.id} className={severityClass[point.severity]}>
            {point.text}
          </div>
        ))}
      </div>
      {summary.recommendation ? (
        <div className="border-[1.5px] border-ink bg-paper p-2 text-ink-2">
          <span className="text-ink-muted">What to drill: </span>
          {summary.recommendation}
        </div>
      ) : null}
    </div>
  );
}

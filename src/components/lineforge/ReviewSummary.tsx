"use client";

import type { ExplanationSummary } from "@/lib/explanations/types";

type ReviewSummaryProps = {
  summary: ExplanationSummary;
  heading?: string;
};

const severityClass = {
  info: "text-stone-300",
  positive: "text-emerald-200",
  warning: "text-amber-100",
  critical: "text-red-200",
};

export function ReviewSummary({ summary, heading = "Review summary" }: ReviewSummaryProps) {
  return (
    <div className="grid gap-2 rounded-md bg-black/30 p-3 text-sm">
      <div className="font-medium text-stone-100">{heading || summary.title}</div>
      <div className="grid gap-1">
        {summary.points.map((point) => (
          <div key={point.id} className={severityClass[point.severity]}>
            {point.text}
          </div>
        ))}
      </div>
      {summary.recommendation ? (
        <div className="rounded-md border border-stone-800 bg-stone-950 p-2 text-stone-200">
          <span className="text-stone-500">What to drill: </span>
          {summary.recommendation}
        </div>
      ) : null}
    </div>
  );
}

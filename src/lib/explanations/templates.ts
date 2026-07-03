import { formatAnalysisTimestamp, formatEvaluation } from "@/lib/engine/local-engine";
import type { ExplanationInput, ExplanationPoint, ExplanationSummary } from "./types";

export function buildExplanationSummary(input: ExplanationInput): ExplanationSummary {
  const points: ExplanationPoint[] = [];

  if (input.engineAnalysis) {
    const bestMove = input.engineAnalysis.bestMoveSan ?? input.engineAnalysis.bestMoveUci;
    points.push({
      id: "engine-best-move",
      severity: "info",
      text: `Engine prefers ${bestMove} at depth ${input.engineAnalysis.depth}.`,
    });
    points.push({
      id: "engine-eval",
      severity: input.engineAnalysis.evaluation.type === "mate" ? "critical" : "info",
      text: describeEvaluation(input.engineAnalysis),
    });
    points.push({
      id: "engine-time",
      severity: "info",
      text: `Analyzed ${formatAnalysisTimestamp(input.engineAnalysis.analyzedAt)}.`,
    });
  } else {
    points.push({
      id: "no-engine",
      severity: "info",
      text: "No engine analysis is saved for this position yet.",
    });
  }

  if (input.tags?.length) {
    points.push({
      id: "tags",
      severity: "warning",
      text: `This position is tagged as ${formatList(input.tags)}.`,
    });
  }

  if (input.userNote?.trim()) {
    points.push({
      id: "note-verdict",
      severity: input.verdict === "blunder" ? "critical" : "info",
      text: `Your note says “${input.userNote.trim()}”; the saved verdict is ${input.verdict ?? "unclear"}.`,
    });
  } else if (input.verdict) {
    points.push({
      id: "verdict",
      severity: input.verdict === "blunder" ? "critical" : input.verdict === "mistake" ? "warning" : "info",
      text: `The saved verdict is ${input.verdict}.`,
    });
  }

  if (input.card) {
    const missed = input.card.attempts - input.card.correct;
    points.push({
      id: "card-history",
      severity: missed > 0 ? "warning" : "positive",
      text: `This card has been missed ${missed} times out of ${input.card.attempts} attempts.`,
    });
  }

  return {
    title: "Review summary",
    points,
    recommendation: buildDrillRecommendation(input),
  };
}

export function describeEvaluation(analysis: NonNullable<ExplanationInput["engineAnalysis"]>) {
  if (analysis.evaluation.type === "mate") {
    return "The best move is a mate sequence.";
  }

  return `The engine evaluation is roughly ${formatEvaluation(analysis.evaluation)}.`;
}

export function buildDrillRecommendation(input: ExplanationInput) {
  const tags = input.tags ?? [];
  const lastAttempt = input.card?.attemptHistory.at(-1);
  const attempts = input.card?.attempts ?? 0;
  const correct = input.card?.correct ?? 0;
  const missed = attempts - correct;

  if (missed >= 3 || lastAttempt?.result === "missed") {
    return "Keep this card in active review.";
  }

  if (tags.includes("missed tactic")) {
    return "Replay this card until you spot the tactic without revealing.";
  }

  if (tags.includes("king safety")) {
    return "Before moving, identify checks and threats against your king.";
  }

  if (tags.includes("bad trade")) {
    return "Compare material and pawn structure before accepting the trade.";
  }

  if (input.verdict === "blunder" || input.verdict === "mistake") {
    return "Review the position slowly before moving on.";
  }

  return undefined;
}

function formatList(values: string[]) {
  if (values.length === 1) return values[0];
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(", ")}, and ${values.at(-1)}`;
}

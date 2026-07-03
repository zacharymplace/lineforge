import { formatEvaluation } from "@/lib/engine/local-engine";
import type {
  CoachLens,
  CoachLensId,
  CoachLensInput,
  CoachLensOutput,
  CoachLensPoint,
} from "./types";

export const COACH_LENSES: CoachLens[] = [
  {
    id: "blunder-audit",
    label: "Blunder Audit",
    description: "Basic safety and error checks.",
  },
  {
    id: "tactics",
    label: "Tactics",
    description: "Forcing move and missed tactic review.",
  },
  {
    id: "king-safety",
    label: "King Safety",
    description: "Checks, threats, and king exposure.",
  },
  {
    id: "trade-check",
    label: "Trade Check",
    description: "Material, activity, and structure before exchanges.",
  },
  {
    id: "opening-minimalist",
    label: "Opening Minimalist",
    description: "Simple plans over long memorized lines.",
  },
  {
    id: "plan-mismatch",
    label: "Plan Mismatch",
    description: "Compare intention, verdict, and tags.",
  },
];

export const DEFAULT_COACH_LENS_ID: CoachLensId = "blunder-audit";
export const DEFAULT_COACH_LENS_COMPARISON_IDS: CoachLensId[] = [
  "blunder-audit",
  "tactics",
  "plan-mismatch",
];
export const MAX_COACH_LENS_COMPARISON = 3;

export function buildCoachLensOutput(
  lensId: CoachLensId,
  input: CoachLensInput,
): CoachLensOutput {
  if (lensId === "tactics") return buildTacticsLens(input);
  if (lensId === "king-safety") return buildKingSafetyLens(input);
  if (lensId === "trade-check") return buildTradeCheckLens(input);
  if (lensId === "opening-minimalist") return buildOpeningMinimalistLens(input);
  if (lensId === "plan-mismatch") return buildPlanMismatchLens(input);
  return buildBlunderAuditLens(input);
}

export function getCoachLens(lensId: CoachLensId) {
  return COACH_LENSES.find((lens) => lens.id === lensId) ?? COACH_LENSES[0];
}

export function normalizeCoachLensComparisonSelection(
  selectedLensIds: CoachLensId[],
  toggledLensId: CoachLensId,
) {
  if (selectedLensIds.includes(toggledLensId)) {
    const nextSelection = selectedLensIds.filter((lensId) => lensId !== toggledLensId);
    return nextSelection.length ? nextSelection : [toggledLensId];
  }

  const nextSelection = [...selectedLensIds, toggledLensId];
  return nextSelection.length > MAX_COACH_LENS_COMPARISON
    ? nextSelection.slice(nextSelection.length - MAX_COACH_LENS_COMPARISON)
    : nextSelection;
}

export function buildCoachLensComparisonOutputs(
  lensIds: CoachLensId[],
  input: CoachLensInput,
) {
  return lensIds.slice(0, MAX_COACH_LENS_COMPARISON).map((lensId) =>
    buildCoachLensOutput(lensId, input),
  );
}

function buildBlunderAuditLens(input: CoachLensInput): CoachLensOutput {
  const points = basePoints(input);
  const isBlunder = input.verdict === "blunder";

  points.push({
    id: "safety-check",
    text: isBlunder
      ? "Because this is marked as a blunder, start with one-move safety: checks, captures, and direct threats."
      : "Use this as a basic safety pass: check whether the move allowed an immediate tactic or hanging piece.",
  });

  if (input.tags?.includes("hung piece")) {
    points.push({
      id: "hung-piece",
      text: "The hung piece tag points to a simple undefended-piece scan before moving.",
    });
  }

  addEnginePoint(points, input);

  return normalizeOutput({
    lensId: "blunder-audit",
    title: "Blunder Audit",
    summary: isBlunder
      ? "This lens treats the position as a concrete error-checking exercise."
      : "This lens gives the position a conservative safety review.",
    points,
    recommendedNextAction: "Replay the position and name checks, captures, threats, and loose pieces before choosing a move.",
    confidence: isBlunder || Boolean(input.engineAnalysis) ? "high" : evidenceConfidence(input),
  });
}

function buildTacticsLens(input: CoachLensInput): CoachLensOutput {
  const tagged = input.tags?.includes("missed tactic") ?? false;
  const points = basePoints(input);

  points.push({
    id: "forcing-moves",
    text: tagged
      ? "The missed tactic tag supports reviewing candidate forcing moves first."
      : "No tactic tag is saved, so treat this only as a candidate-move scan.",
  });
  addEnginePoint(points, input);
  addReviewHistoryPoint(points, input);

  return normalizeOutput({
    lensId: "tactics",
    title: "Tactics Lens",
    summary: tagged
      ? "This position is tagged for tactical review."
      : "This lens can still structure calculation, but the tactical signal is limited.",
    points,
    recommendedNextAction: tagged
      ? "Replay the card until you can list forcing candidate moves without revealing."
      : "List checks, captures, and threats once, then compare with the saved move.",
    confidence: tagged ? "high" : evidenceConfidence(input),
  });
}

function buildKingSafetyLens(input: CoachLensInput): CoachLensOutput {
  const tagged = input.tags?.includes("king safety") ?? false;
  const points = basePoints(input);

  points.push({
    id: "king-threats",
    text: tagged
      ? "The king safety tag supports checking opponent checks and threats before anything else."
      : "No king safety tag is saved, so keep this as a light king-exposure scan.",
  });
  addEnginePoint(points, input);
  addReviewHistoryPoint(points, input);

  return normalizeOutput({
    lensId: "king-safety",
    title: "King Safety Lens",
    summary: tagged
      ? "This lens frames the position around threats to the king."
      : "This lens asks whether king safety was relevant without assuming it was the main issue.",
    points,
    recommendedNextAction: "Before moving, name every legal check and one likely attacking threat for the opponent.",
    confidence: tagged ? "high" : evidenceConfidence(input),
  });
}

function buildTradeCheckLens(input: CoachLensInput): CoachLensOutput {
  const tagged = input.tags?.includes("bad trade") ?? false;
  const points = basePoints(input);

  points.push({
    id: "trade-balance",
    text: tagged
      ? "The bad trade tag supports comparing material, activity, and pawn structure before accepting exchanges."
      : "No bad trade tag is saved, so this is a general exchange-quality checklist.",
  });
  addEnginePoint(points, input);

  return normalizeOutput({
    lensId: "trade-check",
    title: "Trade Check",
    summary: tagged
      ? "This lens reviews whether an exchange changed the position in an unfavorable way."
      : "This lens gives the move a conservative trade-quality pass.",
    points,
    recommendedNextAction: "For any trade, compare material count, piece activity, and pawn structure before committing.",
    confidence: tagged ? "high" : evidenceConfidence(input),
  });
}

function buildOpeningMinimalistLens(input: CoachLensInput): CoachLensOutput {
  const tagged = input.tags?.includes("opening confusion") ?? false;
  const early = typeof input.ply === "number" && input.ply <= 16;
  const points = basePoints(input);

  points.push({
    id: "opening-plan",
    text: tagged && early
      ? "Opening confusion appears early, so focus on the simple plan rather than memorizing long lines."
      : "Use this lens only to extract one simple opening idea from the position.",
  });
  addEnginePoint(points, input);

  return normalizeOutput({
    lensId: "opening-minimalist",
    title: "Opening Minimalist",
    summary: tagged
      ? "This lens turns opening confusion into a small plan reminder."
      : "This lens keeps opening review narrow and practical.",
    points,
    recommendedNextAction: "Write one plan sentence for the opening position and one move that supports it.",
    confidence: tagged || early ? "medium" : "low",
  });
}

function buildPlanMismatchLens(input: CoachLensInput): CoachLensOutput {
  const tagged = input.tags?.includes("plan mismatch") ?? false;
  const hasNote = Boolean(input.userNote?.trim());
  const points = basePoints(input);

  points.push({
    id: "intent-vs-result",
    text:
      tagged && hasNote
        ? "The saved note and plan mismatch tag support comparing what you intended with the recorded verdict."
        : "There is limited intent data, so keep this to a light note/verdict comparison.",
  });
  if (input.userNote?.trim()) {
    points.push({
      id: "note",
      text: `Your saved note says: "${input.userNote.trim()}".`,
    });
  }
  addReviewHistoryPoint(points, input);

  return normalizeOutput({
    lensId: "plan-mismatch",
    title: "Plan Mismatch Lens",
    summary: tagged
      ? "This lens checks whether the move matched the plan you thought you were playing."
      : "This lens compares available intention data without assuming a strategic mistake.",
    points,
    recommendedNextAction: "Before replaying, state the plan in one sentence and verify the move actually serves it.",
    confidence: tagged && hasNote ? "high" : evidenceConfidence(input),
  });
}

function basePoints(input: CoachLensInput): CoachLensPoint[] {
  const points: CoachLensPoint[] = [];

  if (input.moveSan) {
    points.push({ id: "move", text: `Saved move: ${input.moveSan}.` });
  }

  if (input.verdict) {
    points.push({ id: "verdict", text: `Saved verdict: ${input.verdict}.` });
  }

  if (input.tags?.length) {
    points.push({ id: "tags", text: `Saved tags: ${input.tags.join(", ")}.` });
  }

  return points.length ? points : [{ id: "limited-data", text: "Only limited review data is available for this position." }];
}

function addEnginePoint(points: CoachLensPoint[], input: CoachLensInput) {
  if (!input.engineAnalysis) {
    return;
  }

  const bestMove = input.engineAnalysis.bestMoveSan ?? input.engineAnalysis.bestMoveUci;
  points.push({
    id: "engine",
    text: `Engine reference: ${bestMove} at depth ${input.engineAnalysis.depth}, evaluation ${formatEvaluation(input.engineAnalysis.evaluation)}.`,
  });
}

function addReviewHistoryPoint(points: CoachLensPoint[], input: CoachLensInput) {
  if (typeof input.attempts !== "number" || typeof input.correct !== "number") {
    return;
  }

  const missed = input.attempts - input.correct;
  points.push({
    id: "review-history",
    text: `Review history: ${input.correct}/${input.attempts} remembered, ${missed} missed.`,
  });

  if (input.lastAttemptResult) {
    points.push({
      id: "last-attempt",
      text: `Last attempt: ${input.lastAttemptResult}.`,
    });
  }
}

function evidenceConfidence(input: CoachLensInput) {
  if (input.engineAnalysis || input.tags?.length || input.verdict === "blunder") {
    return "medium";
  }

  return input.userNote?.trim() ? "medium" : "low";
}

function normalizeOutput(output: CoachLensOutput): CoachLensOutput {
  return {
    ...output,
    points: output.points.slice(0, 5),
  };
}

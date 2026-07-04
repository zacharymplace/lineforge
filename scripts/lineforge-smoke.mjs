import assert from "node:assert/strict";
import { Chess, validateFen } from "chess.js";

const verdicts = ["good", "mistake", "blunder", "unclear"];
const tags = ["missed tactic", "hung piece", "time pressure"];

function calculateMistakeStats(cards) {
  const byVerdict = Object.fromEntries(verdicts.map((verdict) => [verdict, 0]));
  const tagCounts = new Map();

  for (const card of cards) {
    byVerdict[card.verdict] += 1;
    for (const tag of card.tags) {
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }
  }

  return {
    totalCards: cards.length,
    byVerdict,
    topTags: [...tagCounts.entries()]
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count),
  };
}

function formatEvaluation(evaluation) {
  return evaluation.type === "mate"
    ? `M${evaluation.value}`
    : `${evaluation.value > 0 ? "+" : ""}${(evaluation.value / 100).toFixed(2)}`;
}

const engineDepthOptions = [6, 8, 10, 12, 14];

function normalizeEngineDepth(depth) {
  return engineDepthOptions.includes(depth) ? depth : 10;
}

const engineDepthKey = "lineforge.engine.depth.v1";

function createMemoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));

  return {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}

function loadEngineDepthPreference(storage) {
  return normalizeEngineDepth(Number(storage?.getItem(engineDepthKey)));
}

function saveEngineDepthPreference(depth, storage) {
  const safeDepth = normalizeEngineDepth(depth);
  storage?.setItem(engineDepthKey, String(safeDepth));
  return safeDepth;
}

function formatAnalysisTimestamp(analyzedAt) {
  if (!analyzedAt) {
    return "Unknown time";
  }

  const date = new Date(analyzedAt);
  return Number.isNaN(date.getTime()) ? "Unknown time" : date.toLocaleString();
}

function getStoredAnalysisLabel(kind) {
  if (kind === "current") return "Current unsaved engine result";
  if (kind === "move") return "Saved move analysis";
  return "Saved card analysis";
}

function buildExplanationSummary(input) {
  const points = [];

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

function describeEvaluation(analysis) {
  if (analysis.evaluation.type === "mate") {
    return "The best move is a mate sequence.";
  }

  return `The engine evaluation is roughly ${formatEvaluation(analysis.evaluation)}.`;
}

function buildDrillRecommendation(input) {
  const tagsForRecommendation = input.tags ?? [];
  const lastAttempt = input.card?.attemptHistory.at(-1);
  const attempts = input.card?.attempts ?? 0;
  const correct = input.card?.correct ?? 0;
  const missed = attempts - correct;

  if (missed >= 3 || lastAttempt?.result === "missed") {
    return "Keep this card in active review.";
  }

  if (tagsForRecommendation.includes("missed tactic")) {
    return "Replay this card until you spot the tactic without revealing.";
  }

  if (tagsForRecommendation.includes("king safety")) {
    return "Before moving, identify checks and threats against your king.";
  }

  if (tagsForRecommendation.includes("bad trade")) {
    return "Compare material and pawn structure before accepting the trade.";
  }

  if (input.verdict === "blunder" || input.verdict === "mistake") {
    return "Review the position slowly before moving on.";
  }

  return undefined;
}

function formatList(values) {
  if (values.length === 1) return values[0];
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(", ")}, and ${values.at(-1)}`;
}

function getAttachConfirmation(target) {
  return target === "card" ? "Saved to card" : "Saved to move";
}

function isStaleAnalysis(result, currentFen) {
  return Boolean(result && result.fen !== currentFen);
}

function getEngineTargetLabel(target, canAttachToAnnotation, selectedCardLabel) {
  if (target === "drill") {
    return selectedCardLabel ? `Selected drill card: ${selectedCardLabel}` : "Selected drill card";
  }

  if (target === "annotation" && canAttachToAnnotation) {
    return "Selected move annotation";
  }

  return "Active board position";
}

function nextEngineStatus(current, event) {
  if (event === "load") return "loading";
  if (event === "ready") return "ready";
  if (event === "analyze") return "analyzing";
  if (event === "stop") return current === "analyzing" ? "ready" : current;
  if (event === "error") return "error";
  return "idle";
}

function attachAnalysisToCard(card, analysis) {
  return {
    ...card,
    engineAnalysis: analysis,
  };
}

function attachAnalysisToAnnotation(annotation, analysis) {
  return {
    ...annotation,
    engineAnalysis: analysis,
    updatedAt: new Date().toISOString(),
  };
}

function clearAnalysis(value) {
  const { engineAnalysis, ...rest } = value;
  void engineAnalysis;
  return rest;
}

const coachLensIds = [
  "blunder-audit",
  "tactics",
  "king-safety",
  "trade-check",
  "opening-minimalist",
  "plan-mismatch",
];
const defaultCoachLensComparisonIds = ["blunder-audit", "tactics", "plan-mismatch"];
const maxCoachLensComparison = 3;
const comparisonLensPreferenceKey = "lineforge.coachLenses.comparison.v1";

function buildCoachLensOutput(lensId, input) {
  if (lensId === "tactics") return buildTacticsLens(input);
  if (lensId === "king-safety") return buildKingSafetyLens(input);
  if (lensId === "trade-check") return buildTradeCheckLens(input);
  if (lensId === "opening-minimalist") return buildOpeningMinimalistLens(input);
  if (lensId === "plan-mismatch") return buildPlanMismatchLens(input);
  return buildBlunderAuditLens(input);
}

function normalizeCoachLensComparisonSelection(selectedLensIds, toggledLensId) {
  if (selectedLensIds.includes(toggledLensId)) {
    const nextSelection = selectedLensIds.filter((lensId) => lensId !== toggledLensId);
    return nextSelection.length ? nextSelection : [toggledLensId];
  }

  const nextSelection = [...selectedLensIds, toggledLensId];
  return nextSelection.length > maxCoachLensComparison
    ? nextSelection.slice(nextSelection.length - maxCoachLensComparison)
    : nextSelection;
}

function isValidCoachLensId(value) {
  return typeof value === "string" && coachLensIds.includes(value);
}

function normalizeComparisonLensSelection(value) {
  if (!Array.isArray(value)) {
    return defaultCoachLensComparisonIds;
  }

  const normalized = [];

  for (const lensId of value) {
    if (isValidCoachLensId(lensId) && !normalized.includes(lensId)) {
      normalized.push(lensId);
    }
  }

  return normalized.length
    ? normalized.slice(0, maxCoachLensComparison)
    : defaultCoachLensComparisonIds;
}

function loadComparisonLensPreference(storage) {
  if (!storage) {
    return defaultCoachLensComparisonIds;
  }

  try {
    return normalizeComparisonLensSelection(
      JSON.parse(storage.getItem(comparisonLensPreferenceKey) ?? "null"),
    );
  } catch {
    return defaultCoachLensComparisonIds;
  }
}

function saveComparisonLensPreference(lensIds, storage) {
  const normalized = normalizeComparisonLensSelection(lensIds);
  storage?.setItem(comparisonLensPreferenceKey, JSON.stringify(normalized));
  return normalized;
}

function buildCoachLensComparisonOutputs(lensIds, input) {
  return lensIds
    .slice(0, maxCoachLensComparison)
    .map((lensId) => buildCoachLensOutput(lensId, input));
}

function buildBlunderAuditLens(input) {
  const isBlunder = input.verdict === "blunder";
  return lensOutput("blunder-audit", "Blunder Audit", input, {
    summary: isBlunder
      ? "This lens treats the position as a concrete error-checking exercise."
      : "This lens gives the position a conservative safety review.",
    point: isBlunder
      ? "Because this is marked as a blunder, start with one-move safety: checks, captures, and direct threats."
      : "Use this as a basic safety pass: check whether the move allowed an immediate tactic or hanging piece.",
    action: "Replay the position and name checks, captures, threats, and loose pieces before choosing a move.",
    confidence: isBlunder || input.engineAnalysis ? "high" : evidenceConfidence(input),
  });
}

function buildTacticsLens(input) {
  const tagged = input.tags?.includes("missed tactic");
  return lensOutput("tactics", "Tactics Lens", input, {
    summary: tagged
      ? "This position is tagged for tactical review."
      : "This lens can still structure calculation, but the tactical signal is limited.",
    point: tagged
      ? "The missed tactic tag supports reviewing candidate forcing moves first."
      : "No tactic tag is saved, so treat this only as a candidate-move scan.",
    action: tagged
      ? "Replay the card until you can list forcing candidate moves without revealing."
      : "List checks, captures, and threats once, then compare with the saved move.",
    confidence: tagged ? "high" : evidenceConfidence(input),
  });
}

function buildKingSafetyLens(input) {
  const tagged = input.tags?.includes("king safety");
  return lensOutput("king-safety", "King Safety Lens", input, {
    summary: tagged
      ? "This lens frames the position around threats to the king."
      : "This lens asks whether king safety was relevant without assuming it was the main issue.",
    point: tagged
      ? "The king safety tag supports checking opponent checks and threats before anything else."
      : "No king safety tag is saved, so keep this as a light king-exposure scan.",
    action: "Before moving, name every legal check and one likely attacking threat for the opponent.",
    confidence: tagged ? "high" : evidenceConfidence(input),
  });
}

function buildTradeCheckLens(input) {
  const tagged = input.tags?.includes("bad trade");
  return lensOutput("trade-check", "Trade Check", input, {
    summary: tagged
      ? "This lens reviews whether an exchange changed the position in an unfavorable way."
      : "This lens gives the move a conservative trade-quality pass.",
    point: tagged
      ? "The bad trade tag supports comparing material, activity, and pawn structure before accepting exchanges."
      : "No bad trade tag is saved, so this is a general exchange-quality checklist.",
    action: "For any trade, compare material count, piece activity, and pawn structure before committing.",
    confidence: tagged ? "high" : evidenceConfidence(input),
  });
}

function buildOpeningMinimalistLens(input) {
  const tagged = input.tags?.includes("opening confusion");
  return lensOutput("opening-minimalist", "Opening Minimalist", input, {
    summary: tagged
      ? "This lens turns opening confusion into a small plan reminder."
      : "This lens keeps opening review narrow and practical.",
    point: tagged
      ? "Opening confusion appears early, so focus on the simple plan rather than memorizing long lines."
      : "Use this lens only to extract one simple opening idea from the position.",
    action: "Write one plan sentence for the opening position and one move that supports it.",
    confidence: tagged || input.ply <= 16 ? "medium" : "low",
  });
}

function buildPlanMismatchLens(input) {
  const tagged = input.tags?.includes("plan mismatch");
  return lensOutput("plan-mismatch", "Plan Mismatch Lens", input, {
    summary: tagged
      ? "This lens checks whether the move matched the plan you thought you were playing."
      : "This lens compares available intention data without assuming a strategic mistake.",
    point: tagged
      ? "The saved note and plan mismatch tag support comparing what you intended with the recorded verdict."
      : "There is limited intent data, so keep this to a light note/verdict comparison.",
    action: "Before replaying, state the plan in one sentence and verify the move actually serves it.",
    confidence: tagged && input.userNote ? "high" : evidenceConfidence(input),
  });
}

function lensOutput(lensId, title, input, lens) {
  const points = [];
  if (input.moveSan) points.push({ id: "move", text: `Saved move: ${input.moveSan}.` });
  if (input.verdict) points.push({ id: "verdict", text: `Saved verdict: ${input.verdict}.` });
  if (input.tags?.length) points.push({ id: "tags", text: `Saved tags: ${input.tags.join(", ")}.` });
  if (!points.length) points.push({ id: "limited-data", text: "Only limited review data is available for this position." });
  points.push({ id: "lens", text: lens.point });
  if (input.engineAnalysis) {
    points.push({
      id: "engine",
      text: `Engine reference: ${input.engineAnalysis.bestMoveSan ?? input.engineAnalysis.bestMoveUci} at depth ${input.engineAnalysis.depth}, evaluation ${formatEvaluation(input.engineAnalysis.evaluation)}.`,
    });
  }
  if (typeof input.attempts === "number") {
    points.push({
      id: "review-history",
      text: `Review history: ${input.correct}/${input.attempts} remembered, ${input.attempts - input.correct} missed.`,
    });
  }
  return {
    lensId,
    title,
    summary: lens.summary,
    points: points.slice(0, 5),
    recommendedNextAction: lens.action,
    confidence: lens.confidence,
  };
}

function evidenceConfidence(input) {
  if (input.engineAnalysis || input.tags?.length || input.verdict === "blunder") return "medium";
  return input.userNote ? "medium" : "low";
}

function buildMoveReviewPacket(input) {
  const packetTags = input.annotation?.tags ?? [];
  const reviewSummary = buildExplanationSummary({
    moveSan: input.moveSan,
    verdict: input.annotation?.verdict,
    tags: packetTags,
    userNote: input.annotation?.thought,
    engineAnalysis: input.annotation?.engineAnalysis,
  });

  return {
    id: "packet-move-smoke",
    lineforgeReviewPacketVersion: 1,
    sourceType: "move",
    sourceGameId: input.sourceGameId,
    sourceGameName: input.sourceGameName,
    ply: input.ply,
    fenBefore: input.fenBefore,
    fenAfter: input.fenAfter,
    moveSan: input.moveSan,
    userNote: input.annotation?.thought,
    verdict: input.annotation?.verdict,
    tags: packetTags,
    engineAnalysis: input.annotation?.engineAnalysis,
    reviewSummary,
    coachLens: input.coachLens,
    comparedCoachLenses: input.comparedCoachLenses,
    drillRecommendation: reviewSummary.recommendation,
    createdAt: "2026-07-03T12:00:00.000Z",
  };
}

function buildCardReviewPacket(input) {
  const reviewSummary = buildExplanationSummary({
    moveSan: input.card.moveSan,
    verdict: input.card.verdict,
    tags: input.card.tags,
    userNote: input.card.note,
    engineAnalysis: input.card.engineAnalysis,
    card: {
      ply: input.card.ply,
      attempts: input.card.attempts,
      correct: input.card.correct,
      attemptHistory: input.card.attemptHistory,
    },
  });

  return {
    id: "packet-card-smoke",
    lineforgeReviewPacketVersion: 1,
    sourceType: "card",
    sourceGameId: input.card.sourceGameId,
    sourceGameName: input.sourceGameName,
    ply: input.card.ply,
    fenBefore: input.card.fenBefore,
    fenAfter: input.card.fenAfter,
    moveSan: input.card.moveSan,
    userNote: input.card.note,
    verdict: input.card.verdict,
    tags: input.card.tags,
    engineAnalysis: input.card.engineAnalysis,
    reviewSummary,
    coachLens: input.coachLens,
    comparedCoachLenses: input.comparedCoachLenses,
    drillRecommendation: reviewSummary.recommendation,
    reviewStats: {
      attempts: input.card.attempts,
      correct: input.card.correct,
      lastReviewedAt: input.card.lastReviewedAt,
    },
    recentAttempts: [...input.card.attemptHistory].slice(-5).reverse(),
    createdAt: "2026-07-03T12:00:00.000Z",
  };
}

function serializeReviewPacketJson(packet) {
  return JSON.stringify(packet, null, 2);
}

function renderReviewPacketMarkdown(packet) {
  const lines = [
    `# ${getReviewPacketTitle(packet)}`,
    "",
    `Source: ${packet.sourceType}`,
    packet.sourceGameName ? `Game: ${packet.sourceGameName}` : undefined,
    "",
    "## Position",
    packet.fenBefore ? `FEN before: \`${packet.fenBefore}\`` : "FEN before: Unknown",
    packet.fenAfter ? `FEN after: \`${packet.fenAfter}\`` : undefined,
    "",
    "## Move",
    packet.ply ? `Ply: ${packet.ply}` : undefined,
    packet.moveSan ? `Move: ${packet.moveSan}` : "Move: Unknown",
    "",
    "## User note",
    packet.userNote?.trim() ? packet.userNote.trim() : "No user note saved.",
    "",
    "## Verdict/tags",
    packet.verdict ? `Verdict: ${packet.verdict}` : "Verdict: Unknown",
    `Tags: ${packet.tags.length ? packet.tags.join(", ") : "none"}`,
    "",
    "## Engine analysis",
    ...(packet.engineAnalysis
      ? [
          `Engine: ${packet.engineAnalysis.engineName}`,
          `Best move: ${packet.engineAnalysis.bestMoveSan ?? packet.engineAnalysis.bestMoveUci}`,
          `Evaluation: ${formatEvaluation(packet.engineAnalysis.evaluation)}`,
          `Depth: ${packet.engineAnalysis.depth}`,
        ]
      : ["No engine analysis saved."]),
    "",
    "## Review summary",
    ...packet.reviewSummary.points.map((point) => `- ${point.text}`),
    "",
    "## Coach lens",
    ...(packet.coachLens
      ? [
          `${packet.coachLens.title} (${packet.coachLens.confidence} confidence)`,
          packet.coachLens.summary,
          ...packet.coachLens.points.map((point) => `- ${point.text}`),
          `Next action: ${packet.coachLens.recommendedNextAction}`,
        ]
      : ["No coach lens selected for this packet."]),
    "",
    "## Compared coach lenses",
    ...(packet.comparedCoachLenses?.length
      ? packet.comparedCoachLenses.flatMap((coachLens) => [
          `${coachLens.title} (${coachLens.confidence} confidence)`,
          coachLens.summary,
          ...coachLens.points.slice(0, 3).map((point) => `- ${point.text}`),
          `Next action: ${coachLens.recommendedNextAction}`,
        ])
      : ["No coach lens comparison selected for this packet."]),
    "",
    "## Drill recommendation",
    packet.drillRecommendation ?? "No drill recommendation available.",
    "",
    "## Review history",
    ...(packet.reviewStats
      ? [
          `Attempts: ${packet.reviewStats.attempts}`,
          `Correct: ${packet.reviewStats.correct}`,
          ...(packet.recentAttempts ?? []).map(
            (attempt) =>
              `- ${attempt.result} by ${attempt.method}; expected ${attempt.expectedMoveSan}`,
          ),
        ]
      : ["No review history for this move packet."]),
    "",
  ].filter((line) => line !== undefined);

  return `${lines.join("\n")}\n`;
}

function getReviewPacketTitle(packet) {
  const source = packet.sourceType === "card" ? "Card" : "Move";
  const move = packet.moveSan ? ` ${packet.moveSan}` : "";
  const ply = packet.ply ? `, ply ${packet.ply}` : "";

  return `LineForge ${source} Review Packet${move}${ply}`;
}

function safeFilenamePart(value) {
  const safe = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return safe || "unknown";
}

function getReviewPacketFilename(packet, format) {
  const extension = format === "json" ? "json" : "md";
  const date = safeFilenamePart(packet.createdAt.slice(0, 10));

  if (packet.sourceType === "card") {
    return `lineforge-card-${date}-${safeFilenamePart(packet.id)}.${extension}`;
  }

  return `lineforge-move-${date}-ply-${safeFilenamePart(String(packet.ply ?? "unknown"))}.${extension}`;
}

function applyReviewResult(card, result) {
  return {
    ...card,
    attemptHistory: card.attemptHistory ?? [],
    attempts: card.attempts + 1,
    correct: card.correct + (result === "remembered" ? 1 : 0),
    lastReviewedAt: new Date().toISOString(),
  };
}

function createAttempt(card, result, method, attemptedMoveSan, attemptedFenAfter) {
  return {
    id: `attempt-${method}-${card.attempts + 1}`,
    attemptedAt: new Date().toISOString(),
    attemptedMoveSan,
    attemptedFenAfter,
    expectedMoveSan: card.moveSan,
    result,
    method,
  };
}

function appendAttempt(card, attempt) {
  const attemptHistory = [...(card.attemptHistory ?? []), attempt];

  return {
    ...card,
    attemptHistory,
    attempts: attemptHistory.length,
    correct: attemptHistory.filter((currentAttempt) => currentAttempt.result === "remembered")
      .length,
    lastReviewedAt: attempt.attemptedAt,
  };
}

const sessionSummariesKey = "lineforge.drillQueue.sessionSummaries.v1";
let sessionIdCounter = 0;

function filterSessionCards(cards, filter) {
  if (filter.type === "verdict") {
    return cards.filter((card) => card.verdict === filter.verdict);
  }

  if (filter.type === "tag") {
    return cards.filter((card) => card.tags.includes(filter.tag));
  }

  if (filter.type === "missed-recently") {
    return [...cards]
      .filter((card) => card.attemptHistory.at(-1)?.result === "missed")
      .sort((a, b) => Date.parse(b.lastReviewedAt ?? "") - Date.parse(a.lastReviewedAt ?? ""));
  }

  if (filter.type === "lowest-success-rate") {
    return [...cards].sort((a, b) => {
      const aRate = a.attempts > 0 ? a.correct / a.attempts : 0;
      const bRate = b.attempts > 0 ? b.correct / b.attempts : 0;
      return aRate - bRate || b.attempts - a.attempts;
    });
  }

  if (filter.type === "most-recent") {
    return [...cards].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }

  return cards;
}

const reviewSessionSizeOptions = [5, 10, 15, "all"];
const reviewSessionSizePreferenceKey = "lineforge.drillQueue.sessionSize.v1";

function isValidReviewSessionSize(value) {
  return reviewSessionSizeOptions.includes(value);
}

function normalizeReviewSessionSize(value) {
  if (value === "all") {
    return "all";
  }

  const numericValue = typeof value === "number" ? value : Number(value);
  return isValidReviewSessionSize(numericValue) ? numericValue : 10;
}

function loadReviewSessionSizePreference(storage) {
  return normalizeReviewSessionSize(storage?.getItem(reviewSessionSizePreferenceKey));
}

function saveReviewSessionSizePreference(size, storage) {
  const normalized = normalizeReviewSessionSize(size);
  storage?.setItem(reviewSessionSizePreferenceKey, String(normalized));
  return normalized;
}

function buildReviewSession(cards, filter, size = 10) {
  const filteredCards = filterSessionCards(cards, filter);
  const selectedCards =
    size === "all" ? filteredCards : filteredCards.slice(0, Math.min(size, filteredCards.length));
  if (!selectedCards.length) return null;

  return {
    id: `session-smoke-${sessionIdCounter++}`,
    startedAt: new Date().toISOString(),
    filter,
    sessionSize: size,
    selectedCardIds: selectedCards.map((card) => card.id),
    cards: selectedCards.map((card, index) => ({ cardId: card.id, position: index })),
    currentCardIndex: 0,
    results: {},
    rememberedCount: 0,
    missedCount: 0,
    skippedCount: 0,
  };
}

function buildMissedOnlyRepeatSession(cards, summary) {
  const missedCardIds = getMissedCardIdsFromSessionSummary(summary);
  const missedCards = missedCardIds
    .map((cardId) => cards.find((card) => card.id === cardId))
    .filter(Boolean);
  return buildReviewSession(
    missedCards,
    { type: "missed-only-repeat", sourceSessionId: summary.id },
    "all",
  );
}

function recordReviewSessionResult(session, cardId, result, details = {}) {
  const results = {
    ...session.results,
    [cardId]: {
      cardId,
      result,
      recordedAt: new Date().toISOString(),
      ...details,
    },
  };
  const currentIndex = session.cards.findIndex((card) => card.cardId === cardId);

  return {
    ...session,
    results,
    currentCardIndex: Math.min(session.cards.length, Math.max(session.currentCardIndex, currentIndex + 1)),
    rememberedCount: Object.values(results).filter((item) => item.result === "remembered").length,
    missedCount: Object.values(results).filter((item) => item.result === "missed").length,
    skippedCount: Object.values(results).filter((item) => item.result === "skipped").length,
  };
}

function completeReviewSession(session, cards) {
  const sessionCards = session.selectedCardIds
    .map((cardId) => cards.find((card) => card.id === cardId))
    .filter(Boolean);
  const results = Object.values(session.results);
  const remembered = results.filter((result) => result.result === "remembered").length;
  const missed = results.filter((result) => result.result === "missed").length;
  const skipped = results.filter((result) => result.result === "skipped").length;
  const topMissedTags = getTopMissedTags(session, sessionCards);
  const missedCardIds = results
    .filter((result) => result.result === "missed")
    .map((result) => result.cardId);

  return {
    id: session.id,
    startedAt: session.startedAt,
    completedAt: new Date().toISOString(),
    filter: session.filter,
    sessionSize: session.sessionSize,
    selectedCardIds: session.selectedCardIds,
    missedCardIds,
    totalReviewed: remembered + missed + skipped,
    sessionCardCount: session.selectedCardIds.length,
    remembered,
    missed,
    skipped,
    successRate: remembered + missed > 0 ? Math.round((remembered / (remembered + missed)) * 100) : 0,
    topMissedTags,
    verdictBreakdown: getVerdictBreakdown(sessionCards),
    recommendedNextAction: getSessionRecommendation(session, sessionCards),
    results: session.selectedCardIds
      .map((cardId) => session.results[cardId])
      .filter(Boolean),
  };
}

function getMissedCardIdsFromSessionSummary(summary) {
  const missedCardIds =
    summary.missedCardIds ??
    summary.results?.filter((result) => result.result === "missed").map((result) => result.cardId) ??
    [];

  return [...new Set(missedCardIds)];
}

function getReviewSessionFilterLabel(filter) {
  if (filter.type === "verdict") return `Verdict: ${filter.verdict}`;
  if (filter.type === "tag") return `Tag: ${filter.tag}`;
  if (filter.type === "missed-recently") return "Missed recently";
  if (filter.type === "lowest-success-rate") return "Lowest success rate";
  if (filter.type === "most-recent") return "Most recent cards";
  if (filter.type === "missed-only-repeat") return "Missed-only repeat";
  return "All cards";
}

function getReviewSessionResultDetails(summary, cards) {
  const results =
    summary.results?.length > 0
      ? summary.results
      : summary.selectedCardIds.map((cardId) => ({
          cardId,
          result: getMissedCardIdsFromSessionSummary(summary).includes(cardId) ? "missed" : "skipped",
          recordedAt: summary.completedAt,
        }));

  return results.map((result) => {
    const detailCard = cards.find((currentCard) => currentCard.id === result.cardId);
    return {
      cardId: result.cardId,
      label: detailCard ? `Ply ${detailCard.ply}: ${detailCard.moveSan}` : result.cardId,
      result: result.result,
      recordedAt: result.recordedAt,
      tags: detailCard?.tags ?? [],
      verdict: detailCard?.verdict,
      attemptedMoveSan: result.attemptedMoveSan,
      expectedMoveSan: result.expectedMoveSan ?? detailCard?.moveSan,
    };
  });
}

function getReviewSessionDetail(summary, cards) {
  return {
    summary,
    filterLabel: getReviewSessionFilterLabel(summary.filter),
    isMissedOnlyRepeat: summary.filter.type === "missed-only-repeat",
    resultDetails: getReviewSessionResultDetails(summary, cards),
  };
}

function selectReviewSessionSummary(summaries, sessionId) {
  return summaries.find((summary) => summary.id === sessionId) ?? summaries[0] ?? null;
}

const openingPhaseMaxPly = 20;
const openingWeaknessBucketIds = [
  "opening-confusion",
  "plan-mismatch",
  "missed-tactic",
  "bad-trade",
  "king-safety",
  "blunder",
  "unclear",
];
const openingWeaknessBucketLabels = {
  "opening-confusion": "Opening confusion",
  "plan-mismatch": "Plan mismatch",
  "missed-tactic": "Missed tactic",
  "bad-trade": "Bad trade",
  "king-safety": "King safety",
  blunder: "Blunder",
  unclear: "Unclear",
};
const openingWeaknessFilterPreferenceKey = "lineforge.mistakeGraph.openingWeaknessFilters.v1";
const openingWeaknessReviewStates = ["all", "missed-only", "remembered-only"];
const openingWeaknessKnownTags = [
  "missed tactic",
  "hung piece",
  "bad trade",
  "king safety",
  "opening confusion",
  "endgame technique",
  "time pressure",
  "plan mismatch",
];

function getDefaultOpeningWeaknessFilter() {
  return {
    reviewState: "all",
    currentGameOnly: false,
    verdict: "all",
    tag: "all",
  };
}

function normalizeOpeningWeaknessFilterPreference(value) {
  if (!value || typeof value !== "object") {
    return getDefaultOpeningWeaknessFilter();
  }

  return {
    reviewState: openingWeaknessReviewStates.includes(value.reviewState) ? value.reviewState : "all",
    currentGameOnly: typeof value.currentGameOnly === "boolean" ? value.currentGameOnly : false,
    verdict: value.verdict === "all" || verdicts.includes(value.verdict) ? value.verdict : "all",
    tag: value.tag === "all" || openingWeaknessKnownTags.includes(value.tag) ? value.tag : "all",
  };
}

function loadOpeningWeaknessFilterPreference(storage) {
  try {
    return normalizeOpeningWeaknessFilterPreference(
      JSON.parse(storage?.getItem(openingWeaknessFilterPreferenceKey) ?? "null"),
    );
  } catch {
    return getDefaultOpeningWeaknessFilter();
  }
}

function saveOpeningWeaknessFilterPreference(filter, storage) {
  const normalized = normalizeOpeningWeaknessFilterPreference(filter);
  storage?.setItem(openingWeaknessFilterPreferenceKey, JSON.stringify(normalized));
  return normalized;
}

function createTransientMessageState(message, currentState) {
  return {
    message,
    token: (currentState?.token ?? 0) + 1,
  };
}

function clearTransientMessageState(state, token) {
  return state.token === token ? { message: null, token } : state;
}

function isOpeningPhaseCard(card, maxPly = openingPhaseMaxPly) {
  return card.ply <= maxPly;
}

function buildOpeningWeaknessMap(savedGames, cards, maxPly = openingPhaseMaxPly) {
  const sourceGameNames = new Map(savedGames.map((game) => [game.id, game.name]));
  const openingCards = cards.filter((currentCard) => isOpeningPhaseCard(currentCard, maxPly));
  const signals = openingCards.map((currentCard) => createOpeningWeaknessSignal(currentCard, sourceGameNames));
  return buildOpeningWeaknessMapFromSignals(signals, maxPly);
}

function buildOpeningWeaknessMapFromSignals(signals, maxPly = openingPhaseMaxPly) {
  const buckets = openingWeaknessBucketIds
    .map((bucketId) =>
      buildOpeningWeaknessBucket(
        bucketId,
        signals.filter((signal) => openingSignalMatchesBucket(signal, bucketId)),
      ),
    )
    .filter((bucket) => bucket.count > 0);

  return {
    openingPhaseMaxPly: maxPly,
    signals,
    buckets,
    summary: buildOpeningWeaknessSummary(signals.length, buckets),
  };
}

function filterOpeningWeaknessSignals(signals, filter) {
  return signals.filter((signal) => {
    if (filter.reviewState === "missed-only" && signal.missed === 0) return false;
    if (filter.reviewState === "remembered-only" && (signal.correct === 0 || signal.missed > 0)) {
      return false;
    }
    if (filter.currentGameOnly && filter.activeGameId && signal.sourceGameId !== filter.activeGameId) {
      return false;
    }
    if (filter.currentGameOnly && !filter.activeGameId) return false;
    if (filter.verdict && filter.verdict !== "all" && signal.verdict !== filter.verdict) return false;
    if (filter.tag && filter.tag !== "all" && !signal.tags.includes(filter.tag)) return false;
    return true;
  });
}

function buildFilteredOpeningWeaknessMap(openingMap, filter) {
  return buildOpeningWeaknessMapFromSignals(
    filterOpeningWeaknessSignals(openingMap.signals, filter),
    openingMap.openingPhaseMaxPly,
  );
}

function summarizeOpeningWeaknessFilter(baseMap, filteredMap, filter) {
  return {
    visibleOpeningCards: filteredMap.summary.totalOpeningCards,
    hiddenOpeningCards: Math.max(0, baseMap.summary.totalOpeningCards - filteredMap.summary.totalOpeningCards),
    activeFilterLabels: getOpeningWeaknessFilterLabels(filter),
    topVisibleBucket: filteredMap.summary.strongestBucket,
  };
}

function getOpeningWeaknessFilterLabels(filter) {
  const labels = [];
  if (filter.reviewState === "missed-only") labels.push("Missed only");
  if (filter.reviewState === "remembered-only") labels.push("Remembered only");
  if (filter.currentGameOnly) labels.push("Current saved game");
  if (filter.verdict && filter.verdict !== "all") labels.push(`Verdict: ${filter.verdict}`);
  if (filter.tag && filter.tag !== "all") labels.push(`Tag: ${filter.tag}`);
  return labels.length ? labels : ["All opening cards"];
}

function createOpeningWeaknessSignal(currentCard, sourceGameNames) {
  return {
    cardId: currentCard.id,
    sourceGameId: currentCard.sourceGameId,
    sourceGameName: sourceGameNames.get(currentCard.sourceGameId),
    ply: currentCard.ply,
    moveSan: currentCard.moveSan,
    verdict: currentCard.verdict,
    tags: currentCard.tags,
    attempts: currentCard.attempts,
    correct: currentCard.correct,
    missed: Math.max(0, currentCard.attempts - currentCard.correct),
    lastAttemptResult: currentCard.attemptHistory.at(-1)?.result,
    hasEngineAnalysis: Boolean(currentCard.engineAnalysis),
  };
}

function buildOpeningWeaknessBucket(bucketId, signals) {
  const remembered = signals.reduce((total, signal) => total + signal.correct, 0);
  const missed = signals.reduce((total, signal) => total + signal.missed, 0);

  return {
    id: bucketId,
    label: openingWeaknessBucketLabels[bucketId],
    count: signals.length,
    cardIds: signals.map((signal) => signal.cardId),
    topTags: getOpeningTopTags(signals),
    remembered,
    missed,
    successRate: remembered + missed > 0 ? Math.round((remembered / (remembered + missed)) * 100) : 0,
    representativeMoves: [...new Set(signals.map((signal) => signal.moveSan))].slice(0, 4),
    signals,
    recommendedNextAction:
      missed > 0
        ? "Start with missed cards in this bucket, then replay the same early position once more."
        : "Review this opening bucket as a local recurring pattern.",
  };
}

function buildOpeningWeaknessSummary(totalOpeningCards, buckets) {
  const strongestBucket = [...buckets].sort((a, b) => b.count - a.count || b.missed - a.missed)[0];
  const mostMissedBucket = [...buckets].sort((a, b) => b.missed - a.missed || b.count - a.count)[0];
  return {
    totalOpeningCards,
    strongestBucket,
    mostMissedBucket,
    topRecurringTags: getOpeningTopTags(buckets.flatMap((bucket) => bucket.signals)),
    recommendedNextReviewFocus: mostMissedBucket?.missed
      ? `Focus next on ${mostMissedBucket.label.toLowerCase()} cards with misses.`
      : strongestBucket
        ? `Review ${strongestBucket.label.toLowerCase()} cards as your current opening pattern.`
        : "Create early-game mistake cards to reveal opening patterns.",
  };
}

function openingSignalMatchesBucket(signal, bucketId) {
  if (bucketId === "opening-confusion") return signal.tags.includes("opening confusion");
  if (bucketId === "plan-mismatch") return signal.tags.includes("plan mismatch");
  if (bucketId === "missed-tactic") return signal.tags.includes("missed tactic");
  if (bucketId === "bad-trade") return signal.tags.includes("bad trade");
  if (bucketId === "king-safety") return signal.tags.includes("king safety");
  if (bucketId === "blunder") return signal.verdict === "blunder";
  return signal.verdict === "unclear";
}

function getOpeningTopTags(signals) {
  const counts = new Map();
  for (const signal of signals) {
    for (const tag of signal.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
    .slice(0, 5);
}

function buildOpeningWeaknessReviewCardIds(bucket) {
  return [...new Set(bucket.cardIds)];
}

function buildOpeningWeaknessReviewCardIdsFromSignals(signals) {
  return [...new Set(signals.map((signal) => signal.cardId))];
}

function buildOpeningWeaknessReviewSession(cards, bucket) {
  return buildReviewSession(
    buildOpeningWeaknessReviewCardIds(bucket)
      .map((cardId) => cards.find((currentCard) => currentCard.id === cardId))
      .filter(Boolean),
    { type: "opening-weakness", bucketId: bucket.id },
    "all",
  );
}

function buildOpeningWeaknessVisibleReviewSession(cards, signals) {
  const cardIds = buildOpeningWeaknessReviewCardIdsFromSignals(signals);
  return buildReviewSession(
    cardIds.map((cardId) => cards.find((currentCard) => currentCard.id === cardId)).filter(Boolean),
    { type: "opening-weakness", bucketId: "filtered" },
    "all",
  );
}

const importantScheduleTags = ["missed tactic", "king safety", "hung piece"];

function buildReviewSchedule(cards, sessionSummaries = [], openingMap, now = new Date()) {
  const openingBucketIdsByCard = getOpeningBucketIdsByCard(openingMap);
  const items = cards
    .map((currentCard) =>
      buildReviewScheduleItem(
        currentCard,
        wasSkippedRecently(currentCard.id, sessionSummaries, now),
        openingBucketIdsByCard.get(currentCard.id) ?? [],
        now,
      ),
    )
    .sort((a, b) => b.priorityScore - a.priorityScore || b.ply - a.ply);
  const dueNowItems = items.filter((item) => item.status === "due-now");
  const dueSoonItems = items.filter((item) => item.status === "due-soon");
  const stableItems = items.filter((item) => item.status === "stable");
  const newItems = items.filter((item) => item.status === "new");
  const dueReviewItems = dueNowItems.length ? dueNowItems : dueSoonItems.length ? dueSoonItems : newItems;

  return {
    generatedAt: now.toISOString(),
    items,
    dueNowCount: dueNowItems.length,
    dueSoonCount: dueSoonItems.length,
    stableCount: stableItems.length,
    newCount: newItems.length,
    topPriorityItems: items.slice(0, 5),
    dueReviewCardIds: dueReviewItems.map((item) => item.cardId),
    recommendedNextAction: getScheduleRecommendation(dueNowItems, dueSoonItems, newItems, items),
  };
}

function buildReviewScheduleItem(currentCard, skippedRecently, openingBucketIds, now) {
  const lastAttempt = currentCard.attemptHistory.at(-1);
  const successRate =
    currentCard.attempts > 0 ? Math.round((currentCard.correct / currentCard.attempts) * 100) : 0;
  const reasons = [];

  if (currentCard.attempts === 0) {
    reasons.push({ id: "never-reviewed", label: "Never reviewed", score: 45 });
  }

  if (lastAttempt?.result === "missed") {
    reasons.push({ id: "missed-last", label: "Missed last attempt", score: 70 });
  }

  if (currentCard.attempts >= 2 && successRate < 50) {
    reasons.push({ id: "low-success-rate", label: `Low success rate (${successRate}%)`, score: 30 });
  }

  if (isRememberedRecently(lastAttempt?.result, currentCard.lastReviewedAt, now)) {
    reasons.push({ id: "remembered-recently", label: "Remembered recently", score: -20 });
  }

  if (currentCard.verdict === "blunder") {
    reasons.push({ id: "important-verdict", label: "Blunder verdict", score: 20 });
  }

  for (const tag of importantScheduleTags) {
    if (currentCard.tags.includes(tag)) {
      reasons.push({
        id: "important-tag",
        label: `Priority tag: ${tag}`,
        score: tag === "missed tactic" ? 16 : 12,
      });
    }
  }

  if (skippedRecently) {
    reasons.push({ id: "recently-skipped", label: "Skipped in a recent session", score: 25 });
  }

  return {
    cardId: currentCard.id,
    moveSan: currentCard.moveSan,
    ply: currentCard.ply,
    verdict: currentCard.verdict,
    tags: currentCard.tags,
    status: getScheduleStatus(currentCard, successRate, skippedRecently, now),
    priorityScore: Math.max(0, reasons.reduce((total, reason) => total + reason.score, 0)),
    attempts: currentCard.attempts,
    correct: currentCard.correct,
    successRate,
    lastReviewedAt: currentCard.lastReviewedAt,
    lastAttemptResult: lastAttempt?.result,
    skippedRecently,
    openingBucketIds,
    reasons,
  };
}

function getScheduleStatus(currentCard, successRate, skippedRecently, now) {
  const lastAttempt = currentCard.attemptHistory.at(-1);

  if (currentCard.attempts === 0) return "new";
  if (lastAttempt?.result === "missed") return "due-now";
  if (skippedRecently || (currentCard.attempts >= 2 && successRate < 50)) return "due-soon";
  if (isRememberedRecently(lastAttempt?.result, currentCard.lastReviewedAt, now)) return "stable";
  return "stable";
}

function wasSkippedRecently(cardId, summaries, now) {
  return summaries.some((summary) =>
    summary.results?.some(
      (result) =>
        result.cardId === cardId &&
        result.result === "skipped" &&
        daysBetween(result.recordedAt, now) <= 14,
    ),
  );
}

function isRememberedRecently(result, lastReviewedAt, now) {
  return result === "remembered" && Boolean(lastReviewedAt) && daysBetween(lastReviewedAt, now) <= 3;
}

function daysBetween(value, now) {
  if (!value) return Number.POSITIVE_INFINITY;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return Number.POSITIVE_INFINITY;
  return Math.max(0, (now.getTime() - date.getTime()) / 86_400_000);
}

function getOpeningBucketIdsByCard(openingMap) {
  const bucketIdsByCard = new Map();
  for (const bucket of openingMap?.buckets ?? []) {
    for (const cardId of bucket.cardIds) {
      bucketIdsByCard.set(cardId, [...(bucketIdsByCard.get(cardId) ?? []), bucket.id]);
    }
  }
  return bucketIdsByCard;
}

function getScheduleRecommendation(dueNowItems, dueSoonItems, newItems, allItems) {
  if (allItems.length === 0) return "Create mistake cards to build a review schedule.";
  if (dueNowItems.length > 0) return `Start with ${dueNowItems.length} due-now card${dueNowItems.length === 1 ? "" : "s"}.`;
  if (dueSoonItems.length > 0) {
    return `Review ${dueSoonItems.length} due-soon card${dueSoonItems.length === 1 ? "" : "s"} before they cool off.`;
  }
  if (newItems.length > 0) return `Introduce ${newItems.length} new card${newItems.length === 1 ? "" : "s"} into review.`;
  return "Your current review queue is stable.";
}

function getReviewScheduleStatusLabel(status) {
  if (status === "due-now") return "Due now";
  if (status === "due-soon") return "Due soon";
  if (status === "new") return "New";
  return "Stable";
}

function getReviewScheduleBadgeText(item) {
  return getReviewScheduleStatusLabel(item.status);
}

function getReviewSchedulePriorityLabel(item) {
  if (item.priorityScore >= 80) return "High priority";
  if (item.priorityScore >= 45) return "Medium priority";
  if (item.priorityScore > 0) return "Low priority";
  return "Low priority";
}

function getReviewScheduleCardAction(item) {
  if (item.lastAttemptResult === "missed") return "Review after missed attempt";
  if (item.skippedRecently) return "Review after skipped session";
  if (item.attempts === 0) return "Start first review";
  if (item.status === "due-soon") return "Review soon";
  if (item.status === "due-now") return "Review now";
  return "Keep in rotation";
}

function formatReviewScheduleLastReviewed(item) {
  if (!item.lastReviewedAt) return "Never reviewed";
  const date = new Date(item.lastReviewedAt);
  return Number.isNaN(date.getTime()) ? "Last reviewed unknown" : `Last ${date.toLocaleDateString()}`;
}

function getScheduleFilterLabel(filter) {
  if (filter === "all") return "All cards";
  if (filter === "due-now") return "Due now";
  if (filter === "due-soon") return "Due soon";
  if (filter === "new") return "New";
  if (filter === "stable") return "Stable";
  return "High priority";
}

const drillQueueDisplayScheduleFilters = ["all", "due-now", "due-soon", "stable", "high-priority"];
const defaultDrillQueueCardFilter = {
  scheduleFilter: "all",
  sourceGameFilter: "all",
  lastReviewedFilter: "all",
};

function getDrillQueueScheduleFilterLabel(filter) {
  if (filter === "all") return "All";
  if (filter === "due-now") return "Due";
  if (filter === "due-soon") return "Upcoming";
  if (filter === "stable") return "Later";
  return "Blocked";
}

function getLastReviewedFilterLabel(filter) {
  if (filter === "all") return "All cards";
  if (filter === "never-reviewed") return "Never reviewed";
  if (filter === "reviewed-today") return "Reviewed today";
  if (filter === "reviewed-last-7-days") return "Reviewed in last 7 days";
  return "Not reviewed in 7+ days";
}

function getActiveDrillQueueFilterChips(filter, sourceGameNames = {}) {
  const chips = [];

  if (filter.scheduleFilter !== defaultDrillQueueCardFilter.scheduleFilter) {
    chips.push({ id: "schedule", label: getDrillQueueScheduleFilterChipLabel(filter.scheduleFilter) });
  }

  if (filter.sourceGameFilter !== defaultDrillQueueCardFilter.sourceGameFilter) {
    chips.push({ id: "source-game", label: getSourceGameFilterChipLabel(filter.sourceGameFilter, sourceGameNames) });
  }

  if (filter.lastReviewedFilter !== defaultDrillQueueCardFilter.lastReviewedFilter) {
    chips.push({ id: "last-reviewed", label: getLastReviewedFilterChipLabel(filter.lastReviewedFilter) });
  }

  return chips;
}

function clearDrillQueueFilterChip(filter, chipId) {
  if (chipId === "schedule") {
    return { ...filter, scheduleFilter: defaultDrillQueueCardFilter.scheduleFilter };
  }

  if (chipId === "source-game") {
    return { ...filter, sourceGameFilter: defaultDrillQueueCardFilter.sourceGameFilter };
  }

  return { ...filter, lastReviewedFilter: defaultDrillQueueCardFilter.lastReviewedFilter };
}

function getDrillQueueScheduleFilterChipLabel(filter) {
  if (filter === "due-now") return "Due now";
  if (filter === "due-soon") return "Upcoming";
  if (filter === "stable") return "Later";
  if (filter === "high-priority") return "Blocked";
  return "All";
}

function getLastReviewedFilterChipLabel(filter) {
  if (filter === "never-reviewed") return "Never reviewed";
  if (filter === "reviewed-today") return "Reviewed today";
  if (filter === "reviewed-last-7-days") return "Reviewed last 7 days";
  if (filter === "not-reviewed-7-plus-days") return "Not reviewed 7+ days";
  return "All cards";
}

function getSourceGameFilterChipLabel(filter, sourceGameNames) {
  if (filter === "current") return "Current game";
  if (filter === "all") return "All games";
  const sourceGameId = filter.slice("game:".length);
  return sourceGameNames[sourceGameId] ?? `Game ${sourceGameId.slice(0, 8)}`;
}

function normalizeDrillQueueDisplayScheduleFilter(filter) {
  return drillQueueDisplayScheduleFilters.includes(filter) ? filter : "all";
}

function matchesScheduleFilter(item, filter) {
  if (filter === "all") return true;
  if (!item) return false;
  if (filter === "high-priority") return getReviewSchedulePriorityLabel(item) === "High priority";
  return item.status === filter;
}

function matchesSourceGameFilter(currentCard, filter, activeGameId) {
  if (filter === "all") return true;
  if (!currentCard.sourceGameId) return false;
  if (filter === "current") return Boolean(activeGameId && currentCard.sourceGameId === activeGameId);
  return currentCard.sourceGameId === filter.slice("game:".length);
}

function matchesLastReviewedFilter(currentCard, filter, now = new Date()) {
  if (filter === "all") return true;
  const reviewedDayAge = getLocalDayAge(currentCard.lastReviewedAt, now);

  if (filter === "never-reviewed") return reviewedDayAge === null;
  if (reviewedDayAge === null) return false;
  if (filter === "reviewed-today") return reviewedDayAge === 0;
  if (filter === "reviewed-last-7-days") return reviewedDayAge >= 0 && reviewedDayAge <= 6;
  return reviewedDayAge >= 7;
}

function filterCardsByScheduleStatus(cards, schedule, filter) {
  const scheduleItemsByCardId = new Map(schedule?.items.map((item) => [item.cardId, item]) ?? []);
  return cards.filter((currentCard) =>
    matchesScheduleFilter(scheduleItemsByCardId.get(currentCard.id), filter),
  );
}

function filterDrillQueueCards(cards, schedule, filter, now = new Date()) {
  const scheduleItemsByCardId = new Map(schedule?.items.map((item) => [item.cardId, item]) ?? []);
  return cards.filter(
    (currentCard) =>
      matchesScheduleFilter(scheduleItemsByCardId.get(currentCard.id), filter.scheduleFilter) &&
      matchesSourceGameFilter(currentCard, filter.sourceGameFilter, filter.activeGameId) &&
      matchesLastReviewedFilter(currentCard, filter.lastReviewedFilter, now),
  );
}

function getVisibleScheduleSelectedCardId(visibleCards, selectedCardId) {
  if (selectedCardId && visibleCards.some((currentCard) => currentCard.id === selectedCardId)) {
    return selectedCardId;
  }

  return visibleCards[0]?.id ?? null;
}

function getLocalDayAge(value, now) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const nowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const dateStart = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  return Math.floor((nowStart - dateStart) / 86_400_000);
}

const drillQueueScheduleFilters = ["all", "due-now", "due-soon", "new", "stable", "high-priority"];
const drillQueueScheduleFilterPreferenceKey = "lineforge.drillQueue.scheduleFilter.v1";

function isValidDrillQueueScheduleFilter(value) {
  return drillQueueScheduleFilters.includes(value);
}

function normalizeDrillQueueScheduleFilter(value) {
  return isValidDrillQueueScheduleFilter(value) ? value : "all";
}

function loadDrillQueueScheduleFilterPreference(storage) {
  return normalizeDrillQueueScheduleFilter(
    storage?.getItem(drillQueueScheduleFilterPreferenceKey),
  );
}

function saveDrillQueueScheduleFilterPreference(filter, storage) {
  const normalized = normalizeDrillQueueScheduleFilter(filter);
  storage?.setItem(drillQueueScheduleFilterPreferenceKey, normalized);
  return normalized;
}

function buildDueReviewSession(cards, schedule) {
  return buildReviewSession(
    [...new Set(schedule.dueReviewCardIds)]
      .map((cardId) => cards.find((currentCard) => currentCard.id === cardId))
      .filter(Boolean),
    { type: "due-review" },
    "all",
  );
}

function buildOpeningWeaknessTrend(openingMap, cards, sessionSummaries) {
  const openingCardIds = new Set(openingMap.signals.map((signal) => signal.cardId));
  const cardsById = new Map(cards.filter((currentCard) => openingCardIds.has(currentCard.id)).map((currentCard) => [currentCard.id, currentCard]));
  const memberships = getOpeningBucketMemberships(openingMap);
  const events = [
    ...getOpeningAttemptTrendEvents(cardsById, memberships),
    ...getOpeningSkippedTrendEvents(sessionSummaries, cardsById, memberships),
  ];
  const points = buildOpeningTrendPoints(events);
  const buckets = buildOpeningTrendBuckets(points);

  return {
    points,
    buckets,
    summary: buildOpeningTrendSummary(points, buckets),
  };
}

function getOpeningBucketMemberships(openingMap) {
  const memberships = new Map();
  for (const bucket of openingMap.buckets) {
    for (const cardId of bucket.cardIds) {
      memberships.set(cardId, [...(memberships.get(cardId) ?? []), { id: bucket.id, label: bucket.label }]);
    }
  }
  return memberships;
}

function getOpeningAttemptTrendEvents(cardsById, memberships) {
  const events = [];
  for (const currentCard of cardsById.values()) {
    for (const attempt of currentCard.attemptHistory ?? []) {
      for (const bucket of memberships.get(currentCard.id) ?? []) {
        events.push({
          date: localDateKey(attempt.attemptedAt),
          bucketId: bucket.id,
          bucketLabel: bucket.label,
          cardId: currentCard.id,
          result: attempt.result,
          tags: currentCard.tags,
        });
      }
    }
  }
  return events;
}

function getOpeningSkippedTrendEvents(sessionSummaries, cardsById, memberships) {
  const events = [];
  for (const summary of sessionSummaries) {
    for (const result of summary.results ?? []) {
      if (result.result !== "skipped") continue;
      const currentCard = cardsById.get(result.cardId);
      if (!currentCard) continue;
      for (const bucket of memberships.get(currentCard.id) ?? []) {
        events.push({
          date: localDateKey(result.recordedAt),
          bucketId: bucket.id,
          bucketLabel: bucket.label,
          cardId: currentCard.id,
          result: "skipped",
          tags: currentCard.tags,
        });
      }
    }
  }
  return events;
}

function buildOpeningTrendPoints(events) {
  const pointMap = new Map();
  for (const event of events) {
    const key = `${event.date}:${event.bucketId}`;
    pointMap.set(key, [...(pointMap.get(key) ?? []), event]);
  }
  return [...pointMap.values()]
    .map(toOpeningTrendPoint)
    .sort((a, b) => a.date.localeCompare(b.date) || a.bucketLabel.localeCompare(b.bucketLabel));
}

function toOpeningTrendPoint(events) {
  const remembered = events.filter((event) => event.result === "remembered").length;
  const missed = events.filter((event) => event.result === "missed").length;
  const skipped = events.filter((event) => event.result === "skipped").length;
  return {
    date: events[0].date,
    bucketId: events[0].bucketId,
    bucketLabel: events[0].bucketLabel,
    reviewed: remembered + missed + skipped,
    remembered,
    missed,
    skipped,
    successRate: remembered + missed > 0 ? Math.round((remembered / (remembered + missed)) * 100) : 0,
    cardIds: [...new Set(events.map((event) => event.cardId))],
    topTags: getOpeningTopTags(events),
  };
}

function buildOpeningTrendBuckets(points) {
  const bucketMap = new Map();
  for (const point of points) {
    bucketMap.set(point.bucketId, [...(bucketMap.get(point.bucketId) ?? []), point]);
  }
  return [...bucketMap.values()].map(toOpeningTrendBucket).sort((a, b) => b.reviewed - a.reviewed || b.missed - a.missed);
}

function toOpeningTrendBucket(points) {
  const remembered = points.reduce((total, point) => total + point.remembered, 0);
  const missed = points.reduce((total, point) => total + point.missed, 0);
  const skipped = points.reduce((total, point) => total + point.skipped, 0);
  const successRate = remembered + missed > 0 ? Math.round((remembered / (remembered + missed)) * 100) : 0;
  const recentSuccessRate = getPointSuccessRate(points.at(-1));
  return {
    bucketId: points[0].bucketId,
    bucketLabel: points[0].bucketLabel,
    reviewed: remembered + missed + skipped,
    remembered,
    missed,
    skipped,
    successRate,
    recentSuccessRate,
    successRateDelta: recentSuccessRate - getPointSuccessRate(points[0]),
    cardIds: [...new Set(points.flatMap((point) => point.cardIds))],
    topTags: getOpeningTopTags(points.flatMap((point) => point.topTags.map((tag) => ({ tags: [tag.tag] })))),
  };
}

function buildOpeningTrendSummary(points, buckets) {
  const latestDate = points.at(-1)?.date;
  const latestPoints = latestDate ? points.filter((point) => point.date === latestDate) : [];
  const latestRemembered = latestPoints.reduce((total, point) => total + point.remembered, 0);
  const latestMissed = latestPoints.reduce((total, point) => total + point.missed, 0);
  const improvingBucket = [...buckets].filter((bucket) => bucket.successRateDelta > 0).sort((a, b) => b.successRateDelta - a.successRateDelta)[0];
  const worseningBucket = [...buckets].filter((bucket) => bucket.successRateDelta < 0).sort((a, b) => a.successRateDelta - b.successRateDelta)[0];
  const mostReviewedBucket = [...buckets].sort((a, b) => b.reviewed - a.reviewed)[0];
  const mostMissedBucket = [...buckets].sort((a, b) => b.missed - a.missed || b.reviewed - a.reviewed)[0];
  return {
    totalReviewed: points.reduce((total, point) => total + point.reviewed, 0),
    latestDate,
    latestSuccessRate: latestRemembered + latestMissed > 0 ? Math.round((latestRemembered / (latestRemembered + latestMissed)) * 100) : 0,
    improvingBucket,
    worseningBucket,
    mostReviewedBucket,
    mostMissedBucket,
    recommendedNextFocus: mostMissedBucket?.missed
      ? `Based on local review history, focus next on ${mostMissedBucket.bucketLabel.toLowerCase()}.`
      : "Review opening cards to build a local trend history.",
  };
}

function getPointSuccessRate(point) {
  return point && point.remembered + point.missed > 0 ? point.successRate : 0;
}

function localDateKey(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function getTopMissedTags(session, cards) {
  const counts = new Map();
  for (const result of Object.values(session.results)) {
    if (result.result !== "missed") continue;
    const missedCard = cards.find((card) => card.id === result.cardId);
    for (const tag of missedCard?.tags ?? []) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count);
}

function getVerdictBreakdown(cards) {
  const counts = new Map();
  for (const currentCard of cards) {
    counts.set(currentCard.verdict, (counts.get(currentCard.verdict) ?? 0) + 1);
  }
  return [...counts.entries()].map(([verdict, count]) => ({ verdict, count }));
}

function getSessionRecommendation(session, cards) {
  const topTag = getTopMissedTags(session, cards)[0]?.tag;
  const attempted = session.rememberedCount + session.missedCount;
  const missRate = attempted > 0 ? session.missedCount / attempted : 0;
  if (topTag === "missed tactic") return "Repeat missed tactic cards.";
  if (topTag === "king safety") return "Review king safety cards before your next game.";
  if (missRate >= 0.5) return "Reduce session size if miss rate stays high.";
  return "Keep this card mix in rotation.";
}

function saveReviewSessionSummary(summary, storage) {
  const summaries = loadReviewSessionSummaries(storage);
  const nextSummaries = [summary, ...summaries.filter((item) => item.id !== summary.id)].slice(0, 20);
  storage?.setItem(sessionSummariesKey, JSON.stringify(nextSummaries));
  return nextSummaries;
}

function loadReviewSessionSummaries(storage) {
  try {
    const parsed = JSON.parse(storage?.getItem(sessionSummariesKey) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function clearReviewSessionSummaries(storage) {
  storage?.removeItem(sessionSummariesKey);
}

function createEmptyLibrary(activeGameId = null) {
  return { savedGames: [], activeGameId };
}

function upsertSavedGame(library, game, name = game.name) {
  const savedGame = {
    ...game,
    name: name.trim() || game.name || "Untitled game",
    updatedAt: new Date().toISOString(),
  };
  const exists = library.savedGames.some((currentGame) => currentGame.id === game.id);

  return {
    activeGameId: game.id,
    savedGames: exists
      ? library.savedGames.map((currentGame) =>
          currentGame.id === game.id ? savedGame : currentGame,
        )
      : [savedGame, ...library.savedGames],
  };
}

function renameSavedGame(library, gameId, name) {
  const nextName = name.trim() || "Untitled game";

  return {
    ...library,
    savedGames: library.savedGames.map((game) =>
      game.id === gameId
        ? { ...game, name: nextName, updatedAt: new Date().toISOString() }
        : game,
    ),
  };
}

function loadSavedGame(library, gameId) {
  return library.savedGames.find((game) => game.id === gameId) ?? null;
}

function hasUnsavedChanges(library, activeGame) {
  const savedGame = loadSavedGame(library, activeGame.id);

  if (!savedGame) {
    return true;
  }

  return stableGameSnapshot(savedGame) !== stableGameSnapshot(activeGame);
}

function stableGameSnapshot(game) {
  return JSON.stringify({
    id: game.id,
    name: game.name,
    pgn: game.pgn,
    initialFen: game.initialFen,
    fen: game.fen,
    moves: game.moves,
    annotations: game.annotations,
    importedAt: game.importedAt,
  });
}

function deleteSavedGame(library, gameId) {
  const savedGames = library.savedGames.filter((game) => game.id !== gameId);
  return {
    savedGames,
    activeGameId:
      library.activeGameId === gameId ? (savedGames[0]?.id ?? null) : library.activeGameId,
  };
}

function evaluateDrillMove(card, sourceSquare, targetSquare) {
  const drillChess = new Chess(card.fenBefore);

  try {
    const attemptedMove = drillChess.move({
      from: sourceSquare,
      to: targetSquare,
      promotion: "q",
    });
    const isMatch = attemptedMove.san === card.moveSan || drillChess.fen() === card.fenAfter;

    return {
      reviewResult: isMatch ? "remembered" : "missed",
      attemptedSan: attemptedMove.san,
      attemptedFenAfter: drillChess.fen(),
      expectedSan: card.moveSan,
      isMatch,
    };
  } catch {
    return {
      reviewResult: "missed",
      attemptedSan: null,
      attemptedFenAfter: null,
      expectedSan: card.moveSan,
      isMatch: false,
    };
  }
}

function createBackup(library, mistakeCards) {
  return {
    lineforgeBackupVersion: 1,
    exportedAt: new Date().toISOString(),
    savedGames: library.savedGames,
    activeGameId: library.activeGameId,
    mistakeCards,
  };
}

function parseBackupJson(json) {
  const parsed = JSON.parse(json);

  assert.equal(parsed.lineforgeBackupVersion, 1);
  assert.ok(Array.isArray(parsed.savedGames));
  assert.ok(Array.isArray(parsed.mistakeCards));
  assert.equal(typeof parsed.exportedAt, "string");
  for (const savedGame of parsed.savedGames) {
    assert.equal(validateFen(savedGame.fen).ok, true);
    if (savedGame.initialFen) {
      assert.equal(validateFen(savedGame.initialFen).ok, true);
    }
    if (savedGame.pgn.trim()) {
      const pgnChess = new Chess();
      pgnChess.loadPgn(savedGame.pgn, { strict: false });
    }
    for (const move of savedGame.moves) {
      assert.equal(validateFen(move.before).ok, true);
      assert.equal(validateFen(move.after).ok, true);
    }
  }
  assert.ok(
    parsed.activeGameId === null ||
      parsed.savedGames.some((savedGame) => savedGame.id === parsed.activeGameId),
  );
  for (const cardToValidate of parsed.mistakeCards) {
    assert.equal(validateFen(cardToValidate.fenBefore).ok, true);
    assert.equal(validateFen(cardToValidate.fenAfter).ok, true);
    assert.ok(Array.isArray(cardToValidate.attemptHistory));
    for (const attempt of cardToValidate.attemptHistory) {
      if (attempt.attemptedFenAfter) {
        assert.equal(validateFen(attempt.attemptedFenAfter).ok, true);
      }
    }
    assert.equal(cardToValidate.attempts, cardToValidate.attemptHistory.length);
    assert.equal(
      cardToValidate.correct,
      cardToValidate.attemptHistory.filter((attempt) => attempt.result === "remembered").length,
    );
  }
  return parsed;
}

function parsePgnImportPreview(pgn, hasUnsavedChangesValue) {
  try {
    const trimmedPgn = pgn.trim();
    if (!trimmedPgn) {
      return { ok: false, error: "Paste a PGN before previewing import." };
    }

    const previewChess = new Chess();
    previewChess.loadPgn(trimmedPgn, { strict: false });
    const headers = previewChess.getHeaders();
    const normalizeHeader = (value) => {
      const trimmed = value?.trim();
      return trimmed && trimmed !== "?" ? trimmed : "Unknown";
    };
    const metadata = {
      white: normalizeHeader(headers.White),
      black: normalizeHeader(headers.Black),
      event: normalizeHeader(headers.Event),
      site: normalizeHeader(headers.Site),
      date: normalizeHeader(headers.Date),
      result: normalizeHeader(headers.Result),
    };
    const history = previewChess.history();
    const previewTitle =
      metadata.white !== "Unknown" && metadata.black !== "Unknown"
        ? `${metadata.white} vs ${metadata.black}`
        : metadata.event !== "Unknown" && metadata.date !== "Unknown"
          ? `${metadata.event} - ${metadata.date}`
          : "Imported Game";
    const createMovePreview = (moves) => {
      const first = moves.slice(0, 6).map((san, index) => ({ ply: index + 1, san }));
      const hasDistinctLastMoves = moves.length > 12;
      const last = hasDistinctLastMoves
        ? moves.slice(-6).map((san, index) => ({
            ply: moves.length - 6 + index + 1,
            san,
          }))
        : [];

      return {
        first,
        last,
        totalPlyCount: moves.length,
        hasDistinctLastMoves,
      };
    };
    const buildPreviewPositions = (previewPgn) => {
      const boardChess = new Chess();
      boardChess.loadPgn(previewPgn, { strict: false });
      const moves = boardChess.history({ verbose: true });

      return {
        positions: [
          {
            ply: 0,
            fen: new Chess().fen(),
          },
          ...moves.map((move, index) => ({
            ply: index + 1,
            fen: move.after,
            moveSan: move.san,
          })),
        ],
        totalPlyCount: moves.length,
      };
    };

    return {
      ok: true,
      preview: {
        pgn: trimmedPgn,
        metadata,
        previewTitle,
        suggestedName: previewTitle,
        movePreview: createMovePreview(history),
        boardPreview: buildPreviewPositions(trimmedPgn),
        moveCount: history.length,
        finalFen: previewChess.fen(),
        validationStatus: "valid",
        hasUnsavedWarning: hasUnsavedChangesValue,
        warning: hasUnsavedChangesValue
          ? "Current game has unsaved changes. Importing will replace the active draft."
          : undefined,
      },
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not parse that PGN.",
    };
  }
}

function clampPreviewPly(ply, totalPlyCount) {
  return Math.max(0, Math.min(ply, totalPlyCount));
}

function getPreviewPosition(boardPreview, ply) {
  const safePly = clampPreviewPly(ply, boardPreview.totalPlyCount);
  return boardPreview.positions.find((position) => position.ply === safePly) ?? boardPreview.positions[0];
}

function getPreviewMoveLabel(boardPreview, ply) {
  return getPreviewPosition(boardPreview, ply).moveSan ?? "Start position";
}

function createGameFromImportPreview(preview, name) {
  const importedChess = new Chess();
  importedChess.loadPgn(preview.pgn, { strict: false });

  return {
    id: `game-import-smoke-${Date.now()}`,
    name: name.trim() || "Imported Game",
    pgn: importedChess.pgn(),
    initialFen: new Chess().fen(),
    fen: importedChess.fen(),
    moves: importedChess.history({ verbose: true }).map((move, index) => ({
      ply: index + 1,
      from: move.from,
      to: move.to,
      san: move.san,
      before: move.before,
      after: move.after,
      color: move.color,
      piece: move.piece,
    })),
    annotations: {},
    importedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

const samplePgn = "1. e4 e5 2. Nf3 Nc6 3. Bb5 a6";
const chess = new Chess();
chess.loadPgn(samplePgn);
assert.equal(chess.history().length, 6);
assert.equal(chess.history().at(-1), "a6");

const annotation = {
  ply: 4,
  thought: "I expected normal development.",
  verdict: "mistake",
  tags: [tags[0], tags[2]],
  updatedAt: new Date().toISOString(),
};
assert.deepEqual(JSON.parse(JSON.stringify(annotation)), annotation);

const card = {
  id: "card-smoke",
  sourceGameId: "game-smoke",
  ply: 4,
  fenBefore: chess.history({ verbose: true })[3].before,
  fenAfter: chess.history({ verbose: true })[3].after,
  moveSan: chess.history({ verbose: true })[3].san,
  prompt: "Find the move.",
  note: annotation.thought,
  tags: annotation.tags,
  verdict: annotation.verdict,
  createdAt: new Date().toISOString(),
  attempts: 0,
  correct: 0,
  attemptHistory: [],
};

const engineRequest = {
  fen: card.fenBefore,
  depth: 10,
  timeoutMs: 12000,
};
assert.equal(JSON.parse(JSON.stringify(engineRequest)).fen, card.fenBefore);

const engineResult = {
  fen: card.fenBefore,
  bestMoveUci: "b8c6",
  bestMoveSan: "Nc6",
  evaluation: {
    type: "cp",
    value: 32,
  },
  depth: 10,
  nodes: 123456,
  analyzedAt: new Date().toISOString(),
  engineName: "Stockfish 18 Lite Single",
};
assert.deepEqual(JSON.parse(JSON.stringify(engineResult)).evaluation, {
  type: "cp",
  value: 32,
});
const richLensInput = {
  moveSan: "Nc6",
  ply: 4,
  verdict: "blunder",
  tags: ["missed tactic", "king safety", "bad trade", "opening confusion", "plan mismatch"],
  userNote: "I was focused on attack.",
  engineAnalysis: engineResult,
  attempts: 5,
  correct: 2,
  lastAttemptResult: "missed",
};
for (const lensId of coachLensIds) {
  const output = buildCoachLensOutput(lensId, richLensInput);
  assert.equal(output.lensId, lensId);
  assert.ok(output.title.length > 0);
  assert.ok(output.summary.length > 0);
  assert.ok(output.points.length >= 2);
  assert.ok(output.points.length <= 5);
  assert.ok(output.recommendedNextAction.length > 0);
  assert.ok(["low", "medium", "high"].includes(output.confidence));
}
const defaultComparisonOutputs = buildCoachLensComparisonOutputs(
  defaultCoachLensComparisonIds,
  richLensInput,
);
assert.deepEqual(
  defaultComparisonOutputs.map((output) => output.lensId),
  defaultCoachLensComparisonIds,
);
assert.equal(defaultComparisonOutputs.length, 3);
assert.deepEqual(
  normalizeCoachLensComparisonSelection(
    ["blunder-audit", "tactics", "plan-mismatch"],
    "king-safety",
  ),
  ["tactics", "plan-mismatch", "king-safety"],
);
assert.deepEqual(
  normalizeCoachLensComparisonSelection(["blunder-audit"], "blunder-audit"),
  ["blunder-audit"],
);
assert.equal(isValidCoachLensId("tactics"), true);
assert.equal(isValidCoachLensId("not-a-lens"), false);
assert.deepEqual(
  normalizeComparisonLensSelection(["king-safety", "bad-id", "tactics", "king-safety"]),
  ["king-safety", "tactics"],
);
assert.deepEqual(
  normalizeComparisonLensSelection(["blunder-audit", "tactics", "trade-check", "plan-mismatch"]),
  ["blunder-audit", "tactics", "trade-check"],
);
assert.deepEqual(normalizeComparisonLensSelection([]), defaultCoachLensComparisonIds);
assert.deepEqual(normalizeComparisonLensSelection("nope"), defaultCoachLensComparisonIds);
const validComparisonStorage = createMemoryStorage({
  [comparisonLensPreferenceKey]: JSON.stringify(["king-safety", "trade-check"]),
});
assert.deepEqual(loadComparisonLensPreference(validComparisonStorage), [
  "king-safety",
  "trade-check",
]);
const invalidComparisonStorage = createMemoryStorage({
  [comparisonLensPreferenceKey]: JSON.stringify(["not-a-lens"]),
});
assert.deepEqual(loadComparisonLensPreference(invalidComparisonStorage), defaultCoachLensComparisonIds);
const malformedComparisonStorage = createMemoryStorage({
  [comparisonLensPreferenceKey]: "{ nope",
});
assert.deepEqual(loadComparisonLensPreference(malformedComparisonStorage), defaultCoachLensComparisonIds);
const savedComparisonStorage = createMemoryStorage();
assert.deepEqual(
  saveComparisonLensPreference(["opening-minimalist", "plan-mismatch"], savedComparisonStorage),
  ["opening-minimalist", "plan-mismatch"],
);
assert.deepEqual(JSON.parse(savedComparisonStorage.getItem(comparisonLensPreferenceKey)), [
  "opening-minimalist",
  "plan-mismatch",
]);
const missingDataComparison = buildCoachLensComparisonOutputs(
  defaultCoachLensComparisonIds,
  {},
);
assert.equal(missingDataComparison.length, 3);
assert.ok(missingDataComparison.every((output) => output.confidence === "low"));
assert.ok(
  missingDataComparison.every((output) =>
    output.points.some((point) => /limited review data/i.test(point.text)),
  ),
);
assert.match(
  buildCoachLensOutput("blunder-audit", richLensInput).points.map((point) => point.text).join(" "),
  /one-move safety/i,
);
assert.match(
  buildCoachLensOutput("tactics", richLensInput).recommendedNextAction,
  /forcing candidate moves/i,
);
assert.match(
  buildCoachLensOutput("king-safety", richLensInput).recommendedNextAction,
  /check/i,
);
assert.match(
  buildCoachLensOutput("trade-check", richLensInput).recommendedNextAction,
  /material count/i,
);
assert.equal(buildCoachLensOutput("blunder-audit", {}).confidence, "low");
assert.equal(formatEvaluation(engineResult.evaluation), "+0.32");
assert.equal(formatEvaluation({ type: "cp", value: -48 }), "-0.48");
assert.equal(formatEvaluation({ type: "mate", value: 3 }), "M3");
assert.equal(normalizeEngineDepth(6), 6);
assert.equal(normalizeEngineDepth(14), 14);
assert.equal(normalizeEngineDepth(7), 10);
const validDepthStorage = createMemoryStorage({ [engineDepthKey]: "12" });
assert.equal(loadEngineDepthPreference(validDepthStorage), 12);
const invalidDepthStorage = createMemoryStorage({ [engineDepthKey]: "11" });
assert.equal(loadEngineDepthPreference(invalidDepthStorage), 10);
const missingDepthStorage = createMemoryStorage();
assert.equal(loadEngineDepthPreference(missingDepthStorage), 10);
assert.equal(saveEngineDepthPreference(14, missingDepthStorage), 14);
assert.equal(missingDepthStorage.getItem(engineDepthKey), "14");
assert.equal(saveEngineDepthPreference(99, missingDepthStorage), 10);
assert.equal(missingDepthStorage.getItem(engineDepthKey), "10");
assert.notEqual(formatAnalysisTimestamp(engineResult.analyzedAt), "Unknown time");
assert.equal(formatAnalysisTimestamp("not-a-date"), "Unknown time");
assert.equal(getStoredAnalysisLabel("current"), "Current unsaved engine result");
assert.equal(getStoredAnalysisLabel("move"), "Saved move analysis");
assert.equal(getStoredAnalysisLabel("card"), "Saved card analysis");
const engineSummary = buildExplanationSummary({
  moveSan: "Nc6",
  verdict: "blunder",
  tags: ["king safety", "plan mismatch"],
  userNote: "I was focused on attack.",
  engineAnalysis: engineResult,
});
assert.ok(
  engineSummary.points.some((point) => point.text === "Engine prefers Nc6 at depth 10."),
);
assert.ok(
  engineSummary.points.some(
    (point) => point.text === "The engine evaluation is roughly +0.32.",
  ),
);
assert.ok(
  engineSummary.points.some(
    (point) => point.text === "This position is tagged as king safety and plan mismatch.",
  ),
);
const mateSummary = buildExplanationSummary({
  engineAnalysis: {
    ...engineResult,
    evaluation: { type: "mate", value: 2 },
  },
});
assert.ok(
  mateSummary.points.some((point) => point.text === "The best move is a mate sequence."),
);
const missingEngineSummary = buildExplanationSummary({ verdict: "unclear" });
assert.ok(
  missingEngineSummary.points.some(
    (point) => point.text === "No engine analysis is saved for this position yet.",
  ),
);
assert.equal(getAttachConfirmation("move"), "Saved to move");
assert.equal(getAttachConfirmation("card"), "Saved to card");
assert.equal(isStaleAnalysis(engineResult, card.fenBefore), false);
assert.equal(isStaleAnalysis(engineResult, card.fenAfter), true);
assert.equal(getEngineTargetLabel("active", false), "Active board position");
assert.equal(getEngineTargetLabel("annotation", true), "Selected move annotation");
assert.equal(getEngineTargetLabel("drill", true, "ply 4"), "Selected drill card: ply 4");
assert.equal(nextEngineStatus("idle", "load"), "loading");
assert.equal(nextEngineStatus("loading", "ready"), "ready");
assert.equal(nextEngineStatus("ready", "analyze"), "analyzing");
assert.equal(nextEngineStatus("analyzing", "stop"), "ready");
assert.equal(nextEngineStatus("ready", "error"), "error");
const analyzedCard = attachAnalysisToCard(card, engineResult);
assert.equal(analyzedCard.engineAnalysis.bestMoveSan, "Nc6");
assert.equal(clearAnalysis(analyzedCard).engineAnalysis, undefined);
const analyzedAnnotation = attachAnalysisToAnnotation(annotation, engineResult);
assert.equal(analyzedAnnotation.engineAnalysis.bestMoveUci, "b8c6");
assert.equal(clearAnalysis(analyzedAnnotation).engineAnalysis, undefined);

const game = {
  id: "game-smoke",
  name: "Smoke import",
  pgn: chess.pgn(),
  initialFen: new Chess().fen(),
  fen: chess.fen(),
  moves: chess.history({ verbose: true }).map((move, index) => ({
    ply: index + 1,
    from: move.from,
    to: move.to,
    san: move.san,
    before: move.before,
    after: move.after,
    color: move.color,
    piece: move.piece,
  })),
  annotations: { 4: annotation },
  importedAt: new Date().toISOString(),
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const movePacket = buildMoveReviewPacket({
  sourceGameId: game.id,
  sourceGameName: game.name,
  ply: 4,
  fenBefore: game.moves[3].before,
  fenAfter: game.moves[3].after,
  moveSan: game.moves[3].san,
  annotation: analyzedAnnotation,
  coachLens: buildCoachLensOutput("tactics", richLensInput),
  comparedCoachLenses: defaultComparisonOutputs,
});
assert.equal(movePacket.lineforgeReviewPacketVersion, 1);
assert.equal(movePacket.sourceType, "move");
assert.equal(movePacket.sourceGameId, game.id);
assert.equal(movePacket.ply, 4);
assert.equal(movePacket.engineAnalysis.bestMoveSan, "Nc6");
assert.equal(movePacket.coachLens.lensId, "tactics");
assert.equal(movePacket.comparedCoachLenses.length, 3);
assert.ok(
  movePacket.reviewSummary.points.some((point) => point.text === "Engine prefers Nc6 at depth 10."),
);
const parsedMovePacket = JSON.parse(serializeReviewPacketJson(movePacket));
assert.equal(parsedMovePacket.lineforgeReviewPacketVersion, 1);
assert.equal(parsedMovePacket.comparedCoachLenses.length, 3);
const moveMarkdown = renderReviewPacketMarkdown(movePacket);
assert.match(moveMarkdown, /LineForge Move Review Packet/);
assert.match(moveMarkdown, /## Review summary/);
assert.match(moveMarkdown, /## Coach lens/);
assert.match(moveMarkdown, /## Compared coach lenses/);
assert.match(moveMarkdown, /Plan Mismatch Lens/);
assert.match(moveMarkdown, /Engine prefers Nc6 at depth 10/);
assert.equal(getReviewPacketTitle(movePacket), "LineForge Move Review Packet Nc6, ply 4");
assert.equal(
  getReviewPacketFilename(movePacket, "json"),
  "lineforge-move-2026-07-03-ply-4.json",
);
assert.equal(safeFilenamePart("Ply 4 / Nc6!"), "ply-4-nc6");

const fallbackPacket = buildMoveReviewPacket({
  ply: 0,
  annotation: { ...annotation, engineAnalysis: undefined },
});
assert.equal(fallbackPacket.lineforgeReviewPacketVersion, 1);
assert.equal(fallbackPacket.sourceType, "move");
assert.ok(
  fallbackPacket.reviewSummary.points.some(
    (point) => point.text === "No engine analysis is saved for this position yet.",
  ),
);
assert.match(renderReviewPacketMarkdown(fallbackPacket), /FEN before: Unknown/);
assert.equal(JSON.parse(serializeReviewPacketJson(fallbackPacket)).moveSan, undefined);
assert.equal(
  getReviewPacketFilename(fallbackPacket, "markdown"),
  "lineforge-move-2026-07-03-ply-0.md",
);

const serializedGames = JSON.parse(JSON.stringify([game]));
assert.equal(serializedGames[0].annotations[4].verdict, "mistake");

let activeGame = game;
const pgnWithMetadata = `[Event "Friday Arena"]
[Site "LineForge Local"]
[Date "2026.07.03"]
[White "Ada"]
[Black "Ben"]
[Result "1-0"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 1-0`;
const previewResult = parsePgnImportPreview(pgnWithMetadata, true);
assert.equal(previewResult.ok, true);
assert.equal(activeGame.id, game.id);
assert.equal(previewResult.preview.metadata.white, "Ada");
assert.equal(previewResult.preview.metadata.black, "Ben");
assert.equal(previewResult.preview.metadata.event, "Friday Arena");
assert.equal(previewResult.preview.metadata.site, "LineForge Local");
assert.equal(previewResult.preview.metadata.date, "2026.07.03");
assert.equal(previewResult.preview.metadata.result, "1-0");
assert.equal(previewResult.preview.moveCount, 6);
assert.equal(previewResult.preview.movePreview.totalPlyCount, 6);
assert.equal(previewResult.preview.boardPreview.totalPlyCount, 6);
assert.equal(previewResult.preview.boardPreview.positions.length, 7);
assert.equal(previewResult.preview.boardPreview.positions[0].fen, new Chess().fen());
assert.equal(
  getPreviewPosition(previewResult.preview.boardPreview, 6).fen,
  previewResult.preview.finalFen,
);
assert.equal(
  getPreviewPosition(previewResult.preview.boardPreview, 99).fen,
  previewResult.preview.finalFen,
);
assert.equal(getPreviewPosition(previewResult.preview.boardPreview, -4).fen, new Chess().fen());
assert.equal(clampPreviewPly(-2, previewResult.preview.boardPreview.totalPlyCount), 0);
assert.equal(clampPreviewPly(99, previewResult.preview.boardPreview.totalPlyCount), 6);
assert.equal(getPreviewMoveLabel(previewResult.preview.boardPreview, 0), "Start position");
assert.equal(getPreviewMoveLabel(previewResult.preview.boardPreview, 6), "a6");
assert.deepEqual(
  previewResult.preview.movePreview.first.map((move) => move.san),
  ["e4", "e5", "Nf3", "Nc6", "Bb5", "a6"],
);
assert.equal(previewResult.preview.movePreview.hasDistinctLastMoves, false);
assert.equal(previewResult.preview.movePreview.last.length, 0);
assert.equal(validateFen(previewResult.preview.finalFen).ok, true);
assert.equal(previewResult.preview.previewTitle, "Ada vs Ben");
assert.equal(previewResult.preview.suggestedName, "Ada vs Ben");
assert.equal(previewResult.preview.hasUnsavedWarning, true);
assert.match(previewResult.preview.warning, /unsaved changes/i);
const canceledActiveGame = activeGame;
assert.equal(canceledActiveGame.id, game.id);
const scrubbedPreviewPosition = getPreviewPosition(previewResult.preview.boardPreview, 3);
assert.equal(scrubbedPreviewPosition.moveSan, "Nf3");
assert.equal(activeGame.id, game.id);
activeGame = createGameFromImportPreview(previewResult.preview, "Ada prep game");
assert.notEqual(activeGame.id, game.id);
assert.equal(activeGame.name, "Ada prep game");
assert.equal(activeGame.moves.length, 6);
assert.equal(hasUnsavedChanges(createEmptyLibrary(), activeGame), true);

const missingMetadataPreview = parsePgnImportPreview("1. d4 d5 2. c4 e6", false);
assert.equal(missingMetadataPreview.ok, true);
assert.equal(missingMetadataPreview.preview.metadata.white, "Unknown");
assert.equal(missingMetadataPreview.preview.metadata.black, "Unknown");
assert.equal(missingMetadataPreview.preview.previewTitle, "Imported Game");
assert.equal(missingMetadataPreview.preview.suggestedName, "Imported Game");
assert.equal(missingMetadataPreview.preview.hasUnsavedWarning, false);

const eventOnlyPreview = parsePgnImportPreview(
  `[Event "Training Set"]
[Date "2026.07.03"]

1. c4 e5`,
  false,
);
assert.equal(eventOnlyPreview.ok, true);
assert.equal(eventOnlyPreview.preview.previewTitle, "Training Set - 2026.07.03");
assert.equal(eventOnlyPreview.preview.suggestedName, "Training Set - 2026.07.03");

const longPreview = parsePgnImportPreview(
  "1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 8. c3 O-O",
  false,
);
assert.equal(longPreview.ok, true);
assert.equal(longPreview.preview.movePreview.totalPlyCount, 16);
assert.deepEqual(
  longPreview.preview.movePreview.first.map((move) => move.san),
  ["e4", "e5", "Nf3", "Nc6", "Bb5", "a6"],
);
assert.deepEqual(
  longPreview.preview.movePreview.last.map((move) => move.san),
  ["Re1", "b5", "Bb3", "d6", "c3", "O-O"],
);
assert.equal(longPreview.preview.movePreview.first[0].ply, 1);
assert.equal(longPreview.preview.movePreview.last[0].ply, 11);
assert.equal(longPreview.preview.movePreview.hasDistinctLastMoves, true);

const invalidPreview = parsePgnImportPreview("this is not pgn", true);
assert.equal(invalidPreview.ok, false);
assert.equal(activeGame.name, "Ada prep game");

let library = createEmptyLibrary();
assert.equal(hasUnsavedChanges(library, game), true);
library = upsertSavedGame(library, game, "Smoke saved game");
assert.equal(library.savedGames.length, 1);
assert.equal(loadSavedGame(library, "game-smoke").name, "Smoke saved game");
const savedSmokeGame = loadSavedGame(library, "game-smoke");
assert.equal(hasUnsavedChanges(library, savedSmokeGame), false);
const unsavedSmokeGame = {
  ...savedSmokeGame,
  annotations: {
    ...savedSmokeGame.annotations,
    5: { ...annotation, ply: 5, thought: "New note" },
  },
};
assert.equal(
  hasUnsavedChanges(library, unsavedSmokeGame),
  true,
);
const reloadedSmokeGame = loadSavedGame(library, unsavedSmokeGame.id);
assert.equal(reloadedSmokeGame.annotations[5], undefined);
assert.equal(hasUnsavedChanges(library, reloadedSmokeGame), false);
library = renameSavedGame(library, "game-smoke", "Renamed smoke game");
const renamedGame = loadSavedGame(library, "game-smoke");
assert.equal(renamedGame.id, "game-smoke");
assert.equal(renamedGame.name, "Renamed smoke game");
assert.equal(renamedGame.pgn, savedSmokeGame.pgn);
assert.deepEqual(renamedGame.annotations, savedSmokeGame.annotations);
const draftGame = { ...game, id: "draft-smoke", name: "My draft name" };
assert.equal(hasUnsavedChanges(library, draftGame), true);
library = upsertSavedGame(library, draftGame, draftGame.name);
assert.equal(loadSavedGame(library, "draft-smoke").name, "My draft name");
library = upsertSavedGame(library, unsavedSmokeGame);
assert.equal(hasUnsavedChanges(library, loadSavedGame(library, "game-smoke")), false);
library = upsertSavedGame(library, { ...game, id: "game-smoke-2" }, "Second game");
assert.equal(library.savedGames.length, 3);
library = deleteSavedGame(library, "game-smoke");
assert.equal(loadSavedGame(library, "game-smoke"), null);
assert.equal(library.savedGames.length, 2);

const stats = calculateMistakeStats([
  card,
  { ...card, id: "card-smoke-2", verdict: "blunder", tags: ["hung piece"] },
]);
assert.equal(stats.totalCards, 2);
assert.equal(stats.byVerdict.mistake, 1);
assert.equal(stats.byVerdict.blunder, 1);
assert.equal(stats.topTags[0].tag, "missed tactic");

const correctAttempt = evaluateDrillMove(card, "b8", "c6");
assert.equal(correctAttempt.isMatch, true);
const correctReviewed = appendAttempt(
  card,
  createAttempt(
    card,
    correctAttempt.reviewResult,
    "played",
    correctAttempt.attemptedSan,
    correctAttempt.attemptedFenAfter,
  ),
);
assert.equal(correctReviewed.attempts, 1);
assert.equal(correctReviewed.correct, 1);
assert.equal(correctReviewed.attemptHistory.length, 1);
assert.equal(correctReviewed.attemptHistory[0].method, "played");

const missedAttempt = evaluateDrillMove(card, "g8", "f6");
assert.equal(missedAttempt.isMatch, false);
const missedReviewed = appendAttempt(
  correctReviewed,
  createAttempt(
    correctReviewed,
    missedAttempt.reviewResult,
    "played",
    missedAttempt.attemptedSan,
    missedAttempt.attemptedFenAfter,
  ),
);
assert.equal(missedReviewed.attemptHistory.length, 2);
assert.equal(missedReviewed.correct, 1);

const manualReviewed = appendAttempt(
  missedReviewed,
  createAttempt(missedReviewed, "missed", "manual-reveal"),
);
assert.equal(manualReviewed.attempts, 3);
assert.equal(manualReviewed.correct, 1);
assert.equal(manualReviewed.attemptHistory.at(-1).method, "manual-reveal");

const cardPacket = buildCardReviewPacket({
  sourceGameName: game.name,
  card: attachAnalysisToCard(manualReviewed, engineResult),
  coachLens: buildCoachLensOutput("king-safety", {
    ...richLensInput,
    attempts: manualReviewed.attempts,
    correct: manualReviewed.correct,
  }),
  comparedCoachLenses: buildCoachLensComparisonOutputs(
    ["blunder-audit", "trade-check", "plan-mismatch"],
    richLensInput,
  ),
});
assert.equal(cardPacket.lineforgeReviewPacketVersion, 1);
assert.equal(cardPacket.sourceType, "card");
assert.equal(cardPacket.sourceGameId, card.sourceGameId);
assert.equal(cardPacket.reviewStats.attempts, 3);
assert.equal(cardPacket.reviewStats.correct, 1);
assert.equal(cardPacket.recentAttempts.length, 3);
assert.equal(cardPacket.recentAttempts[0].method, "manual-reveal");
assert.equal(cardPacket.drillRecommendation, "Keep this card in active review.");
assert.equal(cardPacket.coachLens.lensId, "king-safety");
assert.deepEqual(
  cardPacket.comparedCoachLenses.map((output) => output.lensId),
  ["blunder-audit", "trade-check", "plan-mismatch"],
);
const parsedCardPacket = JSON.parse(serializeReviewPacketJson(cardPacket));
assert.equal(parsedCardPacket.reviewStats.attempts, 3);
const cardMarkdown = renderReviewPacketMarkdown(cardPacket);
assert.match(cardMarkdown, /LineForge Card Review Packet/);
assert.match(cardMarkdown, /## Review history/);
assert.match(cardMarkdown, /Attempts: 3/);
assert.equal(getReviewPacketTitle(cardPacket), "LineForge Card Review Packet Nc6, ply 4");
assert.equal(
  getReviewPacketFilename(cardPacket, "markdown"),
  "lineforge-card-2026-07-03-packet-card-smoke.md",
);

const sessionCardSet = [
  manualReviewed,
  {
    ...manualReviewed,
    id: "session-card-blunder",
    verdict: "blunder",
    tags: ["king safety"],
    attempts: 4,
    correct: 1,
    createdAt: "2026-07-03T10:00:00.000Z",
    lastReviewedAt: "2026-07-03T11:00:00.000Z",
    attemptHistory: [
      createAttempt(manualReviewed, "missed", "manual-reveal"),
    ],
  },
  {
    ...manualReviewed,
    id: "session-card-good",
    verdict: "good",
    tags: ["bad trade"],
    attempts: 2,
    correct: 2,
    createdAt: "2026-07-03T12:00:00.000Z",
    lastReviewedAt: "2026-07-03T12:30:00.000Z",
    attemptHistory: [
      createAttempt(manualReviewed, "remembered", "manual-reveal"),
    ],
  },
];
const largeSessionCardSet = Array.from({ length: 6 }, (_, index) => ({
  ...manualReviewed,
  id: `session-size-card-${index + 1}`,
  createdAt: `2026-07-03T12:0${index}:00.000Z`,
}));
const allSession = buildReviewSession(sessionCardSet, { type: "all" });
assert.equal(allSession.selectedCardIds.length, 3);
assert.equal(normalizeReviewSessionSize(5), 5);
assert.equal(normalizeReviewSessionSize("15"), 15);
assert.equal(normalizeReviewSessionSize("all"), "all");
assert.equal(normalizeReviewSessionSize("nope"), 10);
assert.equal(isValidReviewSessionSize(10), true);
assert.equal(isValidReviewSessionSize("all"), true);
assert.equal(isValidReviewSessionSize(7), false);
const validSessionSizeStorage = createMemoryStorage({ [reviewSessionSizePreferenceKey]: "5" });
assert.equal(loadReviewSessionSizePreference(validSessionSizeStorage), 5);
const allSessionSizeStorage = createMemoryStorage({ [reviewSessionSizePreferenceKey]: "all" });
assert.equal(loadReviewSessionSizePreference(allSessionSizeStorage), "all");
const invalidSessionSizeStorage = createMemoryStorage({ [reviewSessionSizePreferenceKey]: "20" });
assert.equal(loadReviewSessionSizePreference(invalidSessionSizeStorage), 10);
const malformedSessionSizeStorage = createMemoryStorage({ [reviewSessionSizePreferenceKey]: "{ nope" });
assert.equal(loadReviewSessionSizePreference(malformedSessionSizeStorage), 10);
const missingSessionSizeStorage = createMemoryStorage();
assert.equal(loadReviewSessionSizePreference(missingSessionSizeStorage), 10);
assert.equal(saveReviewSessionSizePreference("15", missingSessionSizeStorage), 15);
assert.equal(missingSessionSizeStorage.getItem(reviewSessionSizePreferenceKey), "15");
assert.equal(saveReviewSessionSizePreference("all", missingSessionSizeStorage), "all");
assert.equal(missingSessionSizeStorage.getItem(reviewSessionSizePreferenceKey), "all");
assert.equal(buildReviewSession(largeSessionCardSet, { type: "all" }, 5).selectedCardIds.length, 5);
assert.equal(buildReviewSession(sessionCardSet, { type: "all" }, 15).selectedCardIds.length, 3);
assert.equal(buildReviewSession(sessionCardSet, { type: "all" }, "all").selectedCardIds.length, 3);
assert.deepEqual(
  filterSessionCards(sessionCardSet, { type: "verdict", verdict: "blunder" }).map((currentCard) => currentCard.id),
  ["session-card-blunder"],
);
assert.deepEqual(
  filterSessionCards(sessionCardSet, { type: "tag", tag: "bad trade" }).map((currentCard) => currentCard.id),
  ["session-card-good"],
);
assert.equal(
  filterSessionCards(sessionCardSet, { type: "lowest-success-rate" })[0].id,
  "session-card-blunder",
);
let recordedSession = recordReviewSessionResult(allSession, manualReviewed.id, "remembered");
recordedSession = recordReviewSessionResult(recordedSession, "session-card-blunder", "missed", {
  attemptedMoveSan: "Nf6",
  expectedMoveSan: manualReviewed.moveSan,
});
recordedSession = recordReviewSessionResult(recordedSession, "session-card-good", "skipped");
assert.equal(recordedSession.rememberedCount, 1);
assert.equal(recordedSession.missedCount, 1);
assert.equal(recordedSession.skippedCount, 1);
const sessionSummary = completeReviewSession(recordedSession, sessionCardSet);
assert.equal(sessionSummary.sessionCardCount, 3);
assert.equal(sessionSummary.totalReviewed, 3);
assert.equal(sessionSummary.successRate, 50);
assert.deepEqual(sessionSummary.missedCardIds, ["session-card-blunder"]);
assert.equal(sessionSummary.results.length, 3);
assert.equal(sessionSummary.results[1].attemptedMoveSan, "Nf6");
assert.equal(sessionSummary.results[1].expectedMoveSan, manualReviewed.moveSan);
assert.equal(sessionSummary.topMissedTags[0].tag, "king safety");
assert.equal(sessionSummary.recommendedNextAction, "Review king safety cards before your next game.");
const selectedHistoricalSummary = selectReviewSessionSummary([sessionSummary], sessionSummary.id);
assert.equal(selectedHistoricalSummary.id, sessionSummary.id);
const sessionDetail = getReviewSessionDetail(sessionSummary, sessionCardSet);
assert.equal(sessionDetail.filterLabel, "All cards");
assert.equal(sessionDetail.isMissedOnlyRepeat, false);
assert.equal(sessionDetail.resultDetails.length, 3);
assert.equal(sessionDetail.resultDetails[1].label, `Ply 4: ${manualReviewed.moveSan}`);
assert.equal(sessionDetail.resultDetails[1].result, "missed");
assert.deepEqual(sessionDetail.resultDetails[1].tags, ["king safety"]);
assert.equal(sessionDetail.resultDetails[1].verdict, "blunder");
assert.equal(sessionDetail.resultDetails[1].attemptedMoveSan, "Nf6");
assert.equal(sessionDetail.resultDetails[1].expectedMoveSan, manualReviewed.moveSan);
assert.deepEqual(getMissedCardIdsFromSessionSummary(sessionSummary), ["session-card-blunder"]);
const repeatSession = buildMissedOnlyRepeatSession(sessionCardSet, {
  ...sessionSummary,
  missedCardIds: ["session-card-blunder", "session-card-blunder", "missing-card"],
});
assert.deepEqual(repeatSession.selectedCardIds, ["session-card-blunder"]);
assert.equal(repeatSession.filter.type, "missed-only-repeat");
const repeatFromHistory = buildMissedOnlyRepeatSession(sessionCardSet, sessionSummary);
assert.deepEqual(repeatFromHistory.selectedCardIds, ["session-card-blunder"]);
const repeatSummary = completeReviewSession(
  recordReviewSessionResult(repeatSession, "session-card-blunder", "remembered"),
  sessionCardSet,
);
assert.equal(getReviewSessionDetail(repeatSummary, sessionCardSet).isMissedOnlyRepeat, true);
const sessionStorage = createMemoryStorage();
saveReviewSessionSummary(sessionSummary, sessionStorage);
saveReviewSessionSummary(repeatSummary, sessionStorage);
assert.equal(loadReviewSessionSummaries(sessionStorage)[0].id, repeatSummary.id);
assert.equal(loadReviewSessionSummaries(sessionStorage)[1].id, sessionSummary.id);
const cardsBeforeClear = JSON.stringify(sessionCardSet);
clearReviewSessionSummaries(sessionStorage);
assert.equal(loadReviewSessionSummaries(sessionStorage).length, 0);
assert.equal(JSON.stringify(sessionCardSet), cardsBeforeClear);
const openingCards = [
  {
    ...manualReviewed,
    id: "opening-confusion-card",
    sourceGameId: "opening-game",
    ply: 6,
    moveSan: "Nc6",
    verdict: "mistake",
    tags: ["opening confusion"],
    attempts: 2,
    correct: 1,
    attemptHistory: [createAttempt(manualReviewed, "remembered", "manual-reveal")],
  },
  {
    ...manualReviewed,
    id: "plan-mismatch-card",
    sourceGameId: "opening-game",
    ply: 8,
    moveSan: "d6",
    verdict: "mistake",
    tags: ["plan mismatch"],
    attempts: 3,
    correct: 1,
  },
  {
    ...manualReviewed,
    id: "missed-tactic-card",
    sourceGameId: "opening-game",
    ply: 10,
    moveSan: "Bxf7+",
    verdict: "blunder",
    tags: ["missed tactic"],
    attempts: 5,
    correct: 1,
  },
  {
    ...manualReviewed,
    id: "bad-trade-card",
    sourceGameId: "opening-game",
    ply: 12,
    moveSan: "Nxd5",
    verdict: "mistake",
    tags: ["bad trade"],
    attempts: 1,
    correct: 1,
  },
  {
    ...manualReviewed,
    id: "king-safety-card",
    sourceGameId: "opening-game",
    ply: 14,
    moveSan: "O-O-O",
    verdict: "unclear",
    tags: ["king safety"],
    attempts: 2,
    correct: 0,
  },
  {
    ...manualReviewed,
    id: "other-game-opening-card",
    sourceGameId: "other-opening-game",
    ply: 16,
    moveSan: "h4",
    verdict: "mistake",
    tags: ["plan mismatch"],
    attempts: 1,
    correct: 0,
  },
  {
    ...manualReviewed,
    id: "late-opening-tag-card",
    sourceGameId: "opening-game",
    ply: 24,
    moveSan: "Qa4",
    verdict: "blunder",
    tags: ["opening confusion"],
    attempts: 9,
    correct: 0,
  },
];
const openingMap = buildOpeningWeaknessMap(
  [
    { id: "opening-game", name: "Local opening sample" },
    { id: "other-opening-game", name: "Other opening sample" },
  ],
  openingCards,
);
assert.equal(isOpeningPhaseCard({ ply: 20 }), true);
assert.equal(isOpeningPhaseCard({ ply: 21 }), false);
assert.equal(openingMap.summary.totalOpeningCards, 6);
assert.deepEqual(
  openingMap.buckets.find((bucket) => bucket.id === "opening-confusion").cardIds,
  ["opening-confusion-card"],
);
assert.deepEqual(
  openingMap.buckets.find((bucket) => bucket.id === "plan-mismatch").cardIds,
  ["plan-mismatch-card", "other-game-opening-card"],
);
assert.deepEqual(
  openingMap.buckets.find((bucket) => bucket.id === "missed-tactic").cardIds,
  ["missed-tactic-card"],
);
assert.deepEqual(
  openingMap.buckets.find((bucket) => bucket.id === "bad-trade").cardIds,
  ["bad-trade-card"],
);
assert.deepEqual(
  openingMap.buckets.find((bucket) => bucket.id === "king-safety").cardIds,
  ["king-safety-card"],
);
assert.equal(openingMap.summary.strongestBucket.id, "plan-mismatch");
assert.equal(openingMap.summary.mostMissedBucket.id, "missed-tactic");
assert.equal(openingMap.summary.topRecurringTags[0].count, 2);
const missedOnlyOpeningMap = buildFilteredOpeningWeaknessMap(openingMap, {
  reviewState: "missed-only",
});
assert.deepEqual(
  buildOpeningWeaknessReviewCardIdsFromSignals(missedOnlyOpeningMap.signals),
  [
    "opening-confusion-card",
    "plan-mismatch-card",
    "missed-tactic-card",
    "king-safety-card",
    "other-game-opening-card",
  ],
);
const rememberedOnlyOpeningMap = buildFilteredOpeningWeaknessMap(openingMap, {
  reviewState: "remembered-only",
});
assert.deepEqual(
  buildOpeningWeaknessReviewCardIdsFromSignals(rememberedOnlyOpeningMap.signals),
  ["bad-trade-card"],
);
const currentGameOpeningMap = buildFilteredOpeningWeaknessMap(openingMap, {
  reviewState: "all",
  currentGameOnly: true,
  activeGameId: "opening-game",
});
assert.equal(currentGameOpeningMap.summary.totalOpeningCards, 5);
assert.equal(
  currentGameOpeningMap.signals.some((signal) => signal.cardId === "other-game-opening-card"),
  false,
);
const noCurrentGameOpeningMap = buildFilteredOpeningWeaknessMap(openingMap, {
  reviewState: "all",
  currentGameOnly: true,
  activeGameId: null,
});
assert.equal(noCurrentGameOpeningMap.summary.totalOpeningCards, 0);
const verdictOpeningMap = buildFilteredOpeningWeaknessMap(openingMap, {
  reviewState: "all",
  verdict: "blunder",
});
assert.deepEqual(buildOpeningWeaknessReviewCardIdsFromSignals(verdictOpeningMap.signals), [
  "missed-tactic-card",
]);
const tagOpeningMap = buildFilteredOpeningWeaknessMap(openingMap, {
  reviewState: "all",
  tag: "plan mismatch",
});
assert.deepEqual(buildOpeningWeaknessReviewCardIdsFromSignals(tagOpeningMap.signals), [
  "plan-mismatch-card",
  "other-game-opening-card",
]);
const filteredSummary = summarizeOpeningWeaknessFilter(openingMap, tagOpeningMap, {
  reviewState: "all",
  tag: "plan mismatch",
});
assert.equal(filteredSummary.visibleOpeningCards, 2);
assert.equal(filteredSummary.hiddenOpeningCards, 4);
assert.deepEqual(filteredSummary.activeFilterLabels, ["Tag: plan mismatch"]);
assert.equal(filteredSummary.topVisibleBucket.id, "plan-mismatch");
const resetOpeningFilter = getDefaultOpeningWeaknessFilter();
const resetOpeningMap = buildFilteredOpeningWeaknessMap(openingMap, resetOpeningFilter);
const resetSummary = summarizeOpeningWeaknessFilter(openingMap, resetOpeningMap, resetOpeningFilter);
assert.deepEqual(resetOpeningFilter, {
  reviewState: "all",
  currentGameOnly: false,
  verdict: "all",
  tag: "all",
});
assert.equal(resetSummary.visibleOpeningCards, 6);
assert.equal(resetSummary.hiddenOpeningCards, 0);
assert.deepEqual(resetSummary.activeFilterLabels, ["All opening cards"]);
const validOpeningFilterStorage = createMemoryStorage({
  [openingWeaknessFilterPreferenceKey]: JSON.stringify({
    reviewState: "missed-only",
    currentGameOnly: true,
    verdict: "blunder",
    tag: "missed tactic",
  }),
});
assert.deepEqual(loadOpeningWeaknessFilterPreference(validOpeningFilterStorage), {
  reviewState: "missed-only",
  currentGameOnly: true,
  verdict: "blunder",
  tag: "missed tactic",
});
const malformedOpeningFilterStorage = createMemoryStorage({
  [openingWeaknessFilterPreferenceKey]: "{ nope",
});
assert.deepEqual(loadOpeningWeaknessFilterPreference(malformedOpeningFilterStorage), getDefaultOpeningWeaknessFilter());
const invalidOpeningFilterStorage = createMemoryStorage({
  [openingWeaknessFilterPreferenceKey]: JSON.stringify({
    reviewState: "only-weird",
    currentGameOnly: "yes",
    verdict: "bad",
    tag: "fake tag",
  }),
});
assert.deepEqual(loadOpeningWeaknessFilterPreference(invalidOpeningFilterStorage), getDefaultOpeningWeaknessFilter());
const savedOpeningFilterStorage = createMemoryStorage();
assert.deepEqual(
  saveOpeningWeaknessFilterPreference(
    { reviewState: "remembered-only", currentGameOnly: true, verdict: "mistake", tag: "bad trade" },
    savedOpeningFilterStorage,
  ),
  { reviewState: "remembered-only", currentGameOnly: true, verdict: "mistake", tag: "bad trade" },
);
assert.deepEqual(
  JSON.parse(savedOpeningFilterStorage.getItem(openingWeaknessFilterPreferenceKey)),
  { reviewState: "remembered-only", currentGameOnly: true, verdict: "mistake", tag: "bad trade" },
);
assert.deepEqual(
  saveOpeningWeaknessFilterPreference(getDefaultOpeningWeaknessFilter(), savedOpeningFilterStorage),
  getDefaultOpeningWeaknessFilter(),
);
assert.deepEqual(
  JSON.parse(savedOpeningFilterStorage.getItem(openingWeaknessFilterPreferenceKey)),
  getDefaultOpeningWeaknessFilter(),
);
const savedHintState = createTransientMessageState("Filters saved locally");
assert.deepEqual(savedHintState, { message: "Filters saved locally", token: 1 });
const resetHintState = createTransientMessageState("Filters saved locally", savedHintState);
assert.deepEqual(resetHintState, { message: "Filters saved locally", token: 2 });
assert.deepEqual(clearTransientMessageState(resetHintState, 1), resetHintState);
assert.deepEqual(clearTransientMessageState(resetHintState, 2), { message: null, token: 2 });
const missedTacticBucket = openingMap.buckets.find((bucket) => bucket.id === "missed-tactic");
const openingBucketSession = buildOpeningWeaknessReviewSession(openingCards, {
  ...missedTacticBucket,
  cardIds: ["missed-tactic-card", "missed-tactic-card"],
});
assert.deepEqual(openingBucketSession.selectedCardIds, ["missed-tactic-card"]);
assert.equal(openingBucketSession.filter.type, "opening-weakness");
assert.equal(openingBucketSession.filter.bucketId, "missed-tactic");
const filteredBucket = tagOpeningMap.buckets.find((bucket) => bucket.id === "plan-mismatch");
const filteredBucketSession = buildOpeningWeaknessReviewSession(openingCards, filteredBucket);
assert.deepEqual(filteredBucketSession.selectedCardIds, [
  "plan-mismatch-card",
  "other-game-opening-card",
]);
const visibleOpeningSession = buildOpeningWeaknessVisibleReviewSession(openingCards, tagOpeningMap.signals);
assert.deepEqual(visibleOpeningSession.selectedCardIds, [
  "plan-mismatch-card",
  "other-game-opening-card",
]);
assert.equal(buildFilteredOpeningWeaknessMap(openingMap, { reviewState: "all", tag: "time pressure" }).summary.totalOpeningCards, 0);
function createDatedAttempt(card, result, attemptedAt) {
  return {
    id: `attempt-${card.id}-${result}-${attemptedAt}`,
    attemptedAt,
    expectedMoveSan: card.moveSan,
    result,
    method: "manual-reveal",
  };
}
const trendCards = [
  {
    ...manualReviewed,
    id: "trend-tactic-card",
    sourceGameId: "opening-game",
    ply: 6,
    moveSan: "Bxf7+",
    verdict: "mistake",
    tags: ["missed tactic"],
    attemptHistory: [],
  },
  {
    ...manualReviewed,
    id: "trend-king-card",
    sourceGameId: "opening-game",
    ply: 8,
    moveSan: "O-O-O",
    verdict: "mistake",
    tags: ["king safety"],
    attemptHistory: [],
  },
  {
    ...manualReviewed,
    id: "trend-plan-card",
    sourceGameId: "opening-game",
    ply: 10,
    moveSan: "d6",
    verdict: "mistake",
    tags: ["plan mismatch"],
    attemptHistory: [],
  },
  {
    ...manualReviewed,
    id: "trend-trade-card",
    sourceGameId: "opening-game",
    ply: 12,
    moveSan: "Nxd5",
    verdict: "mistake",
    tags: ["bad trade"],
    attemptHistory: [],
  },
];
trendCards[0].attemptHistory = [
  createDatedAttempt(trendCards[0], "missed", "2026-07-01T12:00:00.000Z"),
  createDatedAttempt(trendCards[0], "remembered", "2026-07-02T12:00:00.000Z"),
];
trendCards[1].attemptHistory = [
  createDatedAttempt(trendCards[1], "remembered", "2026-07-01T12:00:00.000Z"),
  createDatedAttempt(trendCards[1], "missed", "2026-07-02T12:00:00.000Z"),
];
trendCards[2].attemptHistory = [
  createDatedAttempt(trendCards[2], "missed", "2026-07-01T12:00:00.000Z"),
  createDatedAttempt(trendCards[2], "missed", "2026-07-02T12:00:00.000Z"),
];
const trendMap = buildOpeningWeaknessMap([{ id: "opening-game", name: "Trend game" }], trendCards);
const trendSessionSummary = {
  ...sessionSummary,
  id: "trend-session",
  results: [
    {
      cardId: "trend-trade-card",
      result: "skipped",
      recordedAt: "2026-07-02T13:00:00.000Z",
    },
  ],
};
const openingTrend = buildOpeningWeaknessTrend(trendMap, trendCards, [trendSessionSummary]);
assert.equal(openingTrend.points.find((point) => point.date === "2026-07-01" && point.bucketId === "missed-tactic").successRate, 0);
assert.equal(openingTrend.points.find((point) => point.date === "2026-07-02" && point.bucketId === "missed-tactic").successRate, 100);
assert.equal(openingTrend.points.find((point) => point.bucketId === "bad-trade").skipped, 1);
assert.equal(openingTrend.buckets.find((bucket) => bucket.bucketId === "missed-tactic").successRateDelta, 100);
assert.equal(openingTrend.summary.improvingBucket.bucketId, "missed-tactic");
assert.equal(openingTrend.summary.worseningBucket.bucketId, "king-safety");
assert.equal(openingTrend.summary.mostMissedBucket.bucketId, "plan-mismatch");
assert.match(openingTrend.summary.recommendedNextFocus, /Based on local review history/i);
const emptyOpeningTrend = buildOpeningWeaknessTrend(trendMap, trendCards.map((currentCard) => ({
  ...currentCard,
  attemptHistory: [],
})), []);
assert.equal(emptyOpeningTrend.points.length, 0);
assert.equal(emptyOpeningTrend.summary.recommendedNextFocus, "Review opening cards to build a local trend history.");
const trendFocusSession = buildReviewSession(
  openingTrend.summary.mostMissedBucket.cardIds
    .map((cardId) => trendCards.find((currentCard) => currentCard.id === cardId))
    .filter(Boolean),
  { type: "opening-weakness", bucketId: openingTrend.summary.mostMissedBucket.bucketId },
  "all",
);
assert.deepEqual(trendFocusSession.selectedCardIds, ["trend-plan-card"]);

const scheduleNow = new Date("2026-07-03T12:00:00.000Z");
const scheduleCards = [
  {
    ...manualReviewed,
    id: "schedule-new-card",
    moveSan: "Nf3",
    verdict: "mistake",
    tags: ["missed tactic"],
    attempts: 0,
    correct: 0,
    sourceGameId: "source-alpha",
    lastReviewedAt: undefined,
    attemptHistory: [],
  },
  {
    ...manualReviewed,
    id: "schedule-missed-card",
    moveSan: "Bxf7+",
    verdict: "blunder",
    tags: ["missed tactic"],
    attempts: 1,
    correct: 0,
    sourceGameId: "source-alpha",
    lastReviewedAt: "2026-07-03T10:00:00.000Z",
    attemptHistory: [
      {
        id: "schedule-missed-attempt",
        attemptedAt: "2026-07-03T10:00:00.000Z",
        expectedMoveSan: "Bxf7+",
        result: "missed",
        method: "manual-reveal",
      },
    ],
  },
  {
    ...manualReviewed,
    id: "schedule-stable-card",
    moveSan: "O-O",
    verdict: "good",
    tags: [],
    attempts: 1,
    correct: 1,
    sourceGameId: "source-beta",
    lastReviewedAt: "2026-07-02T10:00:00.000Z",
    attemptHistory: [
      {
        id: "schedule-stable-attempt",
        attemptedAt: "2026-07-02T10:00:00.000Z",
        expectedMoveSan: "O-O",
        result: "remembered",
        method: "manual-reveal",
      },
    ],
  },
  {
    ...manualReviewed,
    id: "schedule-low-rate-card",
    moveSan: "Nxd5",
    verdict: "mistake",
    tags: ["bad trade"],
    attempts: 4,
    correct: 1,
    sourceGameId: "source-beta",
    lastReviewedAt: "2026-06-30T10:00:00.000Z",
    attemptHistory: [
      {
        id: "schedule-low-rate-attempt",
        attemptedAt: "2026-06-30T10:00:00.000Z",
        expectedMoveSan: "Nxd5",
        result: "remembered",
        method: "manual-reveal",
      },
    ],
  },
  {
    ...manualReviewed,
    id: "schedule-skipped-card",
    moveSan: "Kh1",
    verdict: "mistake",
    tags: ["king safety"],
    attempts: 1,
    correct: 1,
    sourceGameId: "source-gamma",
    lastReviewedAt: "2026-07-01T10:00:00.000Z",
    attemptHistory: [
      {
        id: "schedule-skipped-attempt",
        attemptedAt: "2026-07-01T10:00:00.000Z",
        expectedMoveSan: "Kh1",
        result: "remembered",
        method: "manual-reveal",
      },
    ],
  },
  {
    ...manualReviewed,
    id: "schedule-old-card",
    moveSan: "d4",
    verdict: "good",
    tags: [],
    attempts: 1,
    correct: 1,
    sourceGameId: "source-old",
    lastReviewedAt: "2026-06-20T10:00:00.000Z",
    attemptHistory: [
      {
        id: "schedule-old-attempt",
        attemptedAt: "2026-06-20T10:00:00.000Z",
        expectedMoveSan: "d4",
        result: "remembered",
        method: "manual-reveal",
      },
    ],
  },
];
const scheduleSkipSummary = {
  ...sessionSummary,
  id: "schedule-skip-session",
  results: [
    {
      cardId: "schedule-skipped-card",
      result: "skipped",
      recordedAt: "2026-07-02T10:00:00.000Z",
    },
  ],
};
const reviewSchedule = buildReviewSchedule(scheduleCards, [scheduleSkipSummary], undefined, scheduleNow);
const scheduleStatusById = Object.fromEntries(reviewSchedule.items.map((item) => [item.cardId, item.status]));
assert.equal(scheduleStatusById["schedule-new-card"], "new");
assert.equal(scheduleStatusById["schedule-missed-card"], "due-now");
assert.equal(scheduleStatusById["schedule-stable-card"], "stable");
assert.equal(scheduleStatusById["schedule-low-rate-card"], "due-soon");
assert.equal(scheduleStatusById["schedule-skipped-card"], "due-soon");
assert.equal(reviewSchedule.topPriorityItems[0].cardId, "schedule-missed-card");
assert.deepEqual(reviewSchedule.dueReviewCardIds, ["schedule-missed-card"]);
assert.deepEqual(buildDueReviewSession(scheduleCards, reviewSchedule).selectedCardIds, ["schedule-missed-card"]);
const scheduleItemById = Object.fromEntries(reviewSchedule.items.map((item) => [item.cardId, item]));
assert.equal(getReviewScheduleBadgeText(scheduleItemById["schedule-missed-card"]), "Due now");
assert.equal(getReviewScheduleBadgeText(scheduleItemById["schedule-low-rate-card"]), "Due soon");
assert.equal(getReviewScheduleBadgeText(scheduleItemById["schedule-new-card"]), "New");
assert.equal(getReviewScheduleBadgeText(scheduleItemById["schedule-stable-card"]), "Stable");
assert.equal(getReviewSchedulePriorityLabel(scheduleItemById["schedule-missed-card"]), "High priority");
assert.equal(getReviewSchedulePriorityLabel(scheduleItemById["schedule-new-card"]), "Medium priority");
assert.equal(getReviewScheduleCardAction(scheduleItemById["schedule-missed-card"]), "Review after missed attempt");
assert.equal(getReviewScheduleCardAction(scheduleItemById["schedule-skipped-card"]), "Review after skipped session");
assert.equal(getReviewScheduleCardAction(scheduleItemById["schedule-new-card"]), "Start first review");
assert.equal(formatReviewScheduleLastReviewed(scheduleItemById["schedule-new-card"]), "Never reviewed");
assert.equal(getScheduleFilterLabel("due-now"), "Due now");
assert.equal(getDrillQueueScheduleFilterLabel("all"), "All");
assert.equal(getDrillQueueScheduleFilterLabel("due-now"), "Due");
assert.equal(getDrillQueueScheduleFilterLabel("due-soon"), "Upcoming");
assert.equal(getDrillQueueScheduleFilterLabel("stable"), "Later");
assert.equal(getDrillQueueScheduleFilterLabel("high-priority"), "Blocked");
assert.equal(normalizeDrillQueueDisplayScheduleFilter("new"), "all");
const validDrillQueueFilterStorage = createMemoryStorage({
  [drillQueueScheduleFilterPreferenceKey]: "due-soon",
});
assert.equal(loadDrillQueueScheduleFilterPreference(validDrillQueueFilterStorage), "due-soon");
const allDrillQueueFilterStorage = createMemoryStorage({
  [drillQueueScheduleFilterPreferenceKey]: "all",
});
assert.equal(loadDrillQueueScheduleFilterPreference(allDrillQueueFilterStorage), "all");
const invalidDrillQueueFilterStorage = createMemoryStorage({
  [drillQueueScheduleFilterPreferenceKey]: "not-a-filter",
});
assert.equal(loadDrillQueueScheduleFilterPreference(invalidDrillQueueFilterStorage), "all");
const malformedDrillQueueFilterStorage = createMemoryStorage({
  [drillQueueScheduleFilterPreferenceKey]: "{ nope",
});
assert.equal(loadDrillQueueScheduleFilterPreference(malformedDrillQueueFilterStorage), "all");
const missingDrillQueueFilterStorage = createMemoryStorage();
assert.equal(loadDrillQueueScheduleFilterPreference(missingDrillQueueFilterStorage), "all");
assert.equal(
  saveDrillQueueScheduleFilterPreference("high-priority", missingDrillQueueFilterStorage),
  "high-priority",
);
assert.equal(
  missingDrillQueueFilterStorage.getItem(drillQueueScheduleFilterPreferenceKey),
  "high-priority",
);
assert.equal(saveDrillQueueScheduleFilterPreference("bad", missingDrillQueueFilterStorage), "all");
assert.deepEqual(
  filterCardsByScheduleStatus(scheduleCards, reviewSchedule, "due-now").map((currentCard) => currentCard.id),
  ["schedule-missed-card"],
);
assert.deepEqual(
  filterCardsByScheduleStatus(scheduleCards, reviewSchedule, "due-soon").map((currentCard) => currentCard.id),
  ["schedule-low-rate-card", "schedule-skipped-card"],
);
assert.deepEqual(
  filterCardsByScheduleStatus(scheduleCards, reviewSchedule, "stable").map((currentCard) => currentCard.id),
  ["schedule-stable-card", "schedule-old-card"],
);
assert.deepEqual(
  filterCardsByScheduleStatus(scheduleCards, reviewSchedule, "high-priority").map((currentCard) => currentCard.id),
  ["schedule-missed-card"],
);
assert.equal(filterCardsByScheduleStatus(scheduleCards, reviewSchedule, "all").length, scheduleCards.length);
assert.deepEqual(filterCardsByScheduleStatus([scheduleCards[2]], reviewSchedule, "due-now"), []);
assert.equal(getLastReviewedFilterLabel("never-reviewed"), "Never reviewed");
assert.deepEqual(defaultDrillQueueCardFilter, {
  scheduleFilter: "all",
  sourceGameFilter: "all",
  lastReviewedFilter: "all",
});
assert.deepEqual(getActiveDrillQueueFilterChips(defaultDrillQueueCardFilter), []);
assert.deepEqual(
  getActiveDrillQueueFilterChips({
    ...defaultDrillQueueCardFilter,
    scheduleFilter: "due-now",
  }),
  [{ id: "schedule", label: "Due now" }],
);
assert.deepEqual(
  getActiveDrillQueueFilterChips({
    ...defaultDrillQueueCardFilter,
    sourceGameFilter: "current",
  }),
  [{ id: "source-game", label: "Current game" }],
);
assert.deepEqual(
  getActiveDrillQueueFilterChips(
    {
      ...defaultDrillQueueCardFilter,
      sourceGameFilter: "game:source-alpha",
    },
    { "source-alpha": "Alpha vs Beta" },
  ),
  [{ id: "source-game", label: "Alpha vs Beta" }],
);
assert.deepEqual(
  getActiveDrillQueueFilterChips({
    ...defaultDrillQueueCardFilter,
    lastReviewedFilter: "reviewed-last-7-days",
  }),
  [{ id: "last-reviewed", label: "Reviewed last 7 days" }],
);
const multiDrillQueueFilter = {
  scheduleFilter: "due-soon",
  sourceGameFilter: "game:source-beta",
  lastReviewedFilter: "never-reviewed",
};
assert.deepEqual(
  getActiveDrillQueueFilterChips(multiDrillQueueFilter, { "source-beta": "Beta Study" }),
  [
    { id: "schedule", label: "Upcoming" },
    { id: "source-game", label: "Beta Study" },
    { id: "last-reviewed", label: "Never reviewed" },
  ],
);
assert.deepEqual(clearDrillQueueFilterChip(multiDrillQueueFilter, "schedule"), {
  ...multiDrillQueueFilter,
  scheduleFilter: "all",
});
assert.deepEqual(clearDrillQueueFilterChip(multiDrillQueueFilter, "source-game"), {
  ...multiDrillQueueFilter,
  sourceGameFilter: "all",
});
assert.deepEqual(clearDrillQueueFilterChip(multiDrillQueueFilter, "last-reviewed"), {
  ...multiDrillQueueFilter,
  lastReviewedFilter: "all",
});
assert.deepEqual(
  filterDrillQueueCards(
    scheduleCards,
    reviewSchedule,
    {
      scheduleFilter: "all",
      sourceGameFilter: "game:source-alpha",
      lastReviewedFilter: "all",
    },
    scheduleNow,
  ).map((currentCard) => currentCard.id),
  ["schedule-new-card", "schedule-missed-card"],
);
assert.deepEqual(
  filterDrillQueueCards(
    scheduleCards,
    reviewSchedule,
    {
      scheduleFilter: "all",
      sourceGameFilter: "current",
      lastReviewedFilter: "all",
      activeGameId: "source-beta",
    },
    scheduleNow,
  ).map((currentCard) => currentCard.id),
  ["schedule-stable-card", "schedule-low-rate-card"],
);
assert.deepEqual(
  filterDrillQueueCards(
    scheduleCards,
    reviewSchedule,
    {
      scheduleFilter: "all",
      sourceGameFilter: "all",
      lastReviewedFilter: "never-reviewed",
    },
    scheduleNow,
  ).map((currentCard) => currentCard.id),
  ["schedule-new-card"],
);
assert.deepEqual(
  filterDrillQueueCards(
    scheduleCards,
    reviewSchedule,
    {
      scheduleFilter: "all",
      sourceGameFilter: "all",
      lastReviewedFilter: "reviewed-today",
    },
    scheduleNow,
  ).map((currentCard) => currentCard.id),
  ["schedule-missed-card"],
);
assert.deepEqual(
  filterDrillQueueCards(
    scheduleCards,
    reviewSchedule,
    {
      scheduleFilter: "all",
      sourceGameFilter: "all",
      lastReviewedFilter: "reviewed-last-7-days",
    },
    scheduleNow,
  ).map((currentCard) => currentCard.id),
  [
    "schedule-missed-card",
    "schedule-stable-card",
    "schedule-low-rate-card",
    "schedule-skipped-card",
  ],
);
assert.deepEqual(
  filterDrillQueueCards(
    scheduleCards,
    reviewSchedule,
    {
      scheduleFilter: "all",
      sourceGameFilter: "all",
      lastReviewedFilter: "not-reviewed-7-plus-days",
    },
    scheduleNow,
  ).map((currentCard) => currentCard.id),
  ["schedule-old-card"],
);
assert.deepEqual(
  filterDrillQueueCards(
    scheduleCards,
    reviewSchedule,
    {
      scheduleFilter: "due-soon",
      sourceGameFilter: "game:source-beta",
      lastReviewedFilter: "reviewed-last-7-days",
    },
    scheduleNow,
  ).map((currentCard) => currentCard.id),
  ["schedule-low-rate-card"],
);
assert.deepEqual(
  filterDrillQueueCards(
    scheduleCards,
    reviewSchedule,
    {
      scheduleFilter: "stable",
      sourceGameFilter: "game:source-alpha",
      lastReviewedFilter: "all",
    },
    scheduleNow,
  ),
  [],
);
assert.equal(
  getVisibleScheduleSelectedCardId(
    filterCardsByScheduleStatus(scheduleCards, reviewSchedule, "due-now"),
    "schedule-stable-card",
  ),
  "schedule-missed-card",
);
assert.equal(getVisibleScheduleSelectedCardId([], "schedule-stable-card"), null);
const newOnlySchedule = buildReviewSchedule([scheduleCards[0]], [], undefined, scheduleNow);
assert.deepEqual(newOnlySchedule.dueReviewCardIds, ["schedule-new-card"]);
const emptySchedule = buildReviewSchedule([], [], undefined, scheduleNow);
assert.equal(emptySchedule.items.length, 0);
assert.match(emptySchedule.recommendedNextAction, /Create mistake cards/i);

const repeatedMissSummary = buildExplanationSummary({
  verdict: "mistake",
  tags: ["missed tactic"],
  engineAnalysis: engineResult,
  card: {
    ply: 4,
    attempts: manualReviewed.attempts,
    correct: manualReviewed.correct,
    attemptHistory: manualReviewed.attemptHistory,
  },
});
assert.equal(repeatedMissSummary.recommendation, "Keep this card in active review.");

const tacticSummary = buildExplanationSummary({
  verdict: "mistake",
  tags: ["missed tactic"],
  card: {
    ply: 4,
    attempts: 1,
    correct: 1,
    attemptHistory: [createAttempt(card, "remembered", "manual-reveal")],
  },
});
assert.equal(
  tacticSummary.recommendation,
  "Replay this card until you spot the tactic without revealing.",
);

const tradeSummary = buildExplanationSummary({
  verdict: "mistake",
  tags: ["bad trade"],
});
assert.equal(
  tradeSummary.recommendation,
  "Compare material and pawn structure before accepting the trade.",
);

const freshMissedReviewed = appendAttempt(
  card,
  createAttempt(card, missedAttempt.reviewResult, "played", missedAttempt.attemptedSan),
);
assert.equal(freshMissedReviewed.attemptHistory.length, 1);
assert.equal(freshMissedReviewed.attemptHistory[0].result, "missed");
assert.equal(freshMissedReviewed.attempts, 1);
assert.equal(freshMissedReviewed.correct, 0);
assert.equal(missedReviewed.attempts, 2);
assert.equal(freshMissedReviewed.correct, 0);

const remembered = applyReviewResult(card, "remembered");
assert.equal(remembered.attempts, 1);
assert.equal(remembered.correct, 1);

const missed = applyReviewResult(remembered, "missed");
assert.equal(missed.attempts, 2);
assert.equal(missed.correct, 1);

const backupLibrary = upsertSavedGame(createEmptyLibrary(), game, game.name);
const backup = createBackup(backupLibrary, [manualReviewed]);
const restored = parseBackupJson(JSON.stringify(backup));
assert.equal(restored.savedGames[0].id, game.id);
assert.equal(restored.activeGameId, game.id);
assert.equal(restored.mistakeCards[0].id, card.id);
assert.equal(restored.mistakeCards[0].attemptHistory.length, 3);
let importedState = { library: backupLibrary, cards: [manualReviewed] };
try {
  const invalidBackup = parseBackupJson(
    JSON.stringify({
      ...backup,
      savedGames: [{ ...game, fen: "not a fen" }],
    }),
  );
  importedState = {
    library: {
      savedGames: invalidBackup.savedGames,
      activeGameId: invalidBackup.activeGameId,
    },
    cards: invalidBackup.mistakeCards,
  };
} catch {
  // Keep the previous local state on failed import.
}
assert.equal(importedState.library.savedGames[0].id, game.id);
assert.equal(importedState.cards[0].id, manualReviewed.id);
assert.throws(() =>
  parseBackupJson(
    JSON.stringify({
      ...backup,
      mistakeCards: [{ ...manualReviewed, attempts: 99 }],
    }),
  ),
);
assert.throws(() =>
  parseBackupJson(
    JSON.stringify({
      ...backup,
      savedGames: [{ ...game, fen: "not a fen" }],
    }),
  ),
);
assert.throws(() =>
  parseBackupJson(
    JSON.stringify({
      ...backup,
      savedGames: [{ ...game, pgn: "this is not pgn" }],
    }),
  ),
);
assert.throws(() =>
  parseBackupJson(
    JSON.stringify({
      ...backup,
      mistakeCards: [{ ...manualReviewed, fenBefore: "not a fen" }],
    }),
  ),
);
assert.throws(() => parseBackupJson("{ nope"));

console.log("LineForge smoke test passed.");

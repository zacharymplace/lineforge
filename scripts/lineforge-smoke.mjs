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
  const missedCardIds = [...new Set(summary.missedCardIds)];
  const missedCards = missedCardIds
    .map((cardId) => cards.find((card) => card.id === cardId))
    .filter(Boolean);
  return buildReviewSession(
    missedCards,
    { type: "missed-only-repeat", sourceSessionId: summary.id },
    "all",
  );
}

function recordReviewSessionResult(session, cardId, result) {
  const results = {
    ...session.results,
    [cardId]: {
      cardId,
      result,
      recordedAt: new Date().toISOString(),
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
  };
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
recordedSession = recordReviewSessionResult(recordedSession, "session-card-blunder", "missed");
recordedSession = recordReviewSessionResult(recordedSession, "session-card-good", "skipped");
assert.equal(recordedSession.rememberedCount, 1);
assert.equal(recordedSession.missedCount, 1);
assert.equal(recordedSession.skippedCount, 1);
const sessionSummary = completeReviewSession(recordedSession, sessionCardSet);
assert.equal(sessionSummary.sessionCardCount, 3);
assert.equal(sessionSummary.totalReviewed, 3);
assert.equal(sessionSummary.successRate, 50);
assert.deepEqual(sessionSummary.missedCardIds, ["session-card-blunder"]);
assert.equal(sessionSummary.topMissedTags[0].tag, "king safety");
assert.equal(sessionSummary.recommendedNextAction, "Review king safety cards before your next game.");
const repeatSession = buildMissedOnlyRepeatSession(sessionCardSet, {
  ...sessionSummary,
  missedCardIds: ["session-card-blunder", "session-card-blunder", "missing-card"],
});
assert.deepEqual(repeatSession.selectedCardIds, ["session-card-blunder"]);
assert.equal(repeatSession.filter.type, "missed-only-repeat");
const repeatSummary = completeReviewSession(
  recordReviewSessionResult(repeatSession, "session-card-blunder", "remembered"),
  sessionCardSet,
);
const sessionStorage = createMemoryStorage();
saveReviewSessionSummary(sessionSummary, sessionStorage);
saveReviewSessionSummary(repeatSummary, sessionStorage);
assert.equal(loadReviewSessionSummaries(sessionStorage)[0].id, repeatSummary.id);
assert.equal(loadReviewSessionSummaries(sessionStorage)[1].id, sessionSummary.id);

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

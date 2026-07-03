import { formatAnalysisTimestamp, formatEvaluation } from "@/lib/engine/local-engine";
import type { ReviewPacket } from "./types";

export type ReviewPacketExportFormat = "json" | "markdown";

export function serializeReviewPacketJson(packet: ReviewPacket) {
  return JSON.stringify(packet, null, 2);
}

export function renderReviewPacketMarkdown(packet: ReviewPacket) {
  const lines = [
    `# ${getPacketTitle(packet)}`,
    "",
    `Created: ${formatAnalysisTimestamp(packet.createdAt)}`,
    `Source: ${packet.sourceType}`,
    packet.sourceGameName ? `Game: ${packet.sourceGameName}` : undefined,
    packet.sourceGameId ? `Game ID: ${packet.sourceGameId}` : undefined,
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
    ...renderEngineAnalysis(packet),
    "",
    "## Review summary",
    ...packet.reviewSummary.points.map((point) => `- ${point.text}`),
    "",
    "## Drill recommendation",
    packet.drillRecommendation ?? "No drill recommendation available.",
    "",
    "## Review history",
    ...renderReviewHistory(packet),
    "",
  ].filter((line): line is string => line !== undefined);

  return `${lines.join("\n")}\n`;
}

export function getReviewPacketFilename(
  packet: ReviewPacket,
  format: ReviewPacketExportFormat,
) {
  const extension = format === "json" ? "json" : "md";
  const date = safeFilenamePart(packet.createdAt.slice(0, 10) || new Date().toISOString().slice(0, 10));

  if (packet.sourceType === "card") {
    return `lineforge-card-${date}-${safeFilenamePart(packet.id)}.${extension}`;
  }

  return `lineforge-move-${date}-ply-${safeFilenamePart(String(packet.ply ?? "unknown"))}.${extension}`;
}

export function downloadReviewPacket(
  packet: ReviewPacket,
  format: ReviewPacketExportFormat,
) {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }

  const content =
    format === "json" ? serializeReviewPacketJson(packet) : renderReviewPacketMarkdown(packet);
  const type = format === "json" ? "application/json" : "text/markdown";
  const blob = new Blob([content], { type });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = getReviewPacketFilename(packet, format);
  document.body.append(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

export function safeFilenamePart(value: string) {
  const safe = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return safe || "unknown";
}

function getPacketTitle(packet: ReviewPacket) {
  const source = packet.sourceType === "card" ? "Card" : "Move";
  const move = packet.moveSan ? ` ${packet.moveSan}` : "";
  const ply = packet.ply ? `, ply ${packet.ply}` : "";

  return `LineForge ${source} Review Packet${move}${ply}`;
}

function renderEngineAnalysis(packet: ReviewPacket) {
  if (!packet.engineAnalysis) {
    return ["No engine analysis saved."];
  }

  return [
    `Engine: ${packet.engineAnalysis.engineName}`,
    `Best move: ${packet.engineAnalysis.bestMoveSan ?? packet.engineAnalysis.bestMoveUci}`,
    `Evaluation: ${formatEvaluation(packet.engineAnalysis.evaluation)}`,
    `Depth: ${packet.engineAnalysis.depth}`,
    packet.engineAnalysis.nodes ? `Nodes: ${packet.engineAnalysis.nodes}` : undefined,
    `Analyzed: ${formatAnalysisTimestamp(packet.engineAnalysis.analyzedAt)}`,
  ].filter((line): line is string => line !== undefined);
}

function renderReviewHistory(packet: ReviewPacket) {
  if (!packet.reviewStats) {
    return ["No review history for this move packet."];
  }

  const lines = [
    `Attempts: ${packet.reviewStats.attempts}`,
    `Correct: ${packet.reviewStats.correct}`,
    packet.reviewStats.lastReviewedAt
      ? `Last reviewed: ${formatAnalysisTimestamp(packet.reviewStats.lastReviewedAt)}`
      : "Last reviewed: Never",
  ];

  if (!packet.recentAttempts?.length) {
    return [...lines, "Recent attempts: none"];
  }

  return [
    ...lines,
    "Recent attempts:",
    ...packet.recentAttempts.map(
      (attempt) =>
        `- ${formatAnalysisTimestamp(attempt.attemptedAt)}: ${attempt.result} by ${attempt.method}; expected ${attempt.expectedMoveSan}${
          attempt.attemptedMoveSan ? `, played ${attempt.attemptedMoveSan}` : ""
        }`,
    ),
  ];
}

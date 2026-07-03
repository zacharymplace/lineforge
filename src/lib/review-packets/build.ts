import { buildExplanationSummary } from "@/lib/explanations/templates";
import type {
  CardReviewPacketInput,
  MoveReviewPacketInput,
  ReviewPacket,
  ReviewPacketSourceType,
} from "./types";
import { LINEFORGE_REVIEW_PACKET_VERSION } from "./types";

export function buildMoveReviewPacket(input: MoveReviewPacketInput): ReviewPacket {
  const tags = input.annotation?.tags ?? [];
  const reviewSummary = buildExplanationSummary({
    moveSan: input.moveSan,
    verdict: input.annotation?.verdict,
    tags,
    userNote: input.annotation?.thought,
    engineAnalysis: input.annotation?.engineAnalysis,
  });

  return {
    id: createPacketId("move"),
    lineforgeReviewPacketVersion: LINEFORGE_REVIEW_PACKET_VERSION,
    sourceType: "move",
    sourceGameId: input.sourceGameId,
    sourceGameName: input.sourceGameName,
    ply: input.ply,
    fenBefore: input.fenBefore,
    fenAfter: input.fenAfter,
    moveSan: input.moveSan,
    userNote: input.annotation?.thought,
    verdict: input.annotation?.verdict,
    tags,
    engineAnalysis: input.annotation?.engineAnalysis,
    reviewSummary,
    coachLens: input.coachLens,
    drillRecommendation: reviewSummary.recommendation,
    createdAt: new Date().toISOString(),
  };
}

export function buildCardReviewPacket(input: CardReviewPacketInput): ReviewPacket {
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
    id: createPacketId("card"),
    lineforgeReviewPacketVersion: LINEFORGE_REVIEW_PACKET_VERSION,
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
    drillRecommendation: reviewSummary.recommendation,
    reviewStats: {
      attempts: input.card.attempts,
      correct: input.card.correct,
      lastReviewedAt: input.card.lastReviewedAt,
    },
    recentAttempts: [...input.card.attemptHistory].slice(-5).reverse(),
    createdAt: new Date().toISOString(),
  };
}

function createPacketId(sourceType: ReviewPacketSourceType) {
  const randomId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);

  return `packet-${sourceType}-${randomId}`;
}

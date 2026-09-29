"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ENGINE_DEPTH_OPTIONS,
  formatAnalysisTimestamp,
  formatEvaluation,
  getAttachConfirmation,
  getEngineTargetLabel,
  getStoredAnalysisLabel,
  isStaleAnalysis,
  loadEngineDepthPreference,
  LocalStockfishEngine,
  normalizeEngineDepth,
  saveEngineDepthPreference,
} from "@/lib/engine/local-engine";
import type {
  EngineAnalysisResult,
  EngineStatus,
} from "@/lib/engine/types";
import { buildExplanationSummary } from "@/lib/explanations/templates";
import type { MistakeCard } from "@/lib/move-ledger/types";
import { ReviewSummary } from "./ReviewSummary";
import { StatusHint } from "./StatusHint";

type AnalysisTarget = "active" | "annotation" | "drill";

type EngineAnalysisPanelProps = {
  activeFen: string;
  canAttachToAnnotation: boolean;
  currentAnnotationAnalysis?: EngineAnalysisResult;
  selectedCard: MistakeCard | null;
  onAttachToAnnotation: (analysis: EngineAnalysisResult) => void;
  onAttachToCard: (cardId: string, analysis: EngineAnalysisResult) => void;
};

export function EngineAnalysisPanel({
  activeFen,
  canAttachToAnnotation,
  currentAnnotationAnalysis,
  selectedCard,
  onAttachToAnnotation,
  onAttachToCard,
}: EngineAnalysisPanelProps) {
  const engineRef = useRef<LocalStockfishEngine | null>(null);
  const [status, setStatus] = useState<EngineStatus>("idle");
  const [target, setTarget] = useState<AnalysisTarget>(
    canAttachToAnnotation ? "annotation" : "active",
  );
  const [depth, setDepth] = useState(() => loadEngineDepthPreference());
  const [result, setResult] = useState<EngineAnalysisResult | null>(null);
  const [error, setError] = useState("");
  const [confirmation, setConfirmation] = useState("");

  useEffect(() => {
    const engine = new LocalStockfishEngine();
    engineRef.current = engine;
    const unsubscribe = engine.subscribe(setStatus);

    return () => {
      unsubscribe();
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  const targetFen = target === "drill" && selectedCard ? selectedCard.fenBefore : activeFen;
  const targetLabel = getEngineTargetLabel(
    target,
    canAttachToAnnotation,
    selectedCard ? `ply ${selectedCard.ply}` : undefined,
  );
  const storedAnalysis = useMemo(() => {
    if (target === "drill") {
      return selectedCard?.engineAnalysis;
    }

    return currentAnnotationAnalysis;
  }, [currentAnnotationAnalysis, selectedCard, target]);
  const visibleResult = result ?? storedAnalysis ?? null;
  const visibleResultKind = result ? "current" : target === "drill" ? "card" : "move";
  const isResultStale = isStaleAnalysis(visibleResult, targetFen);

  function selectTarget(nextTarget: AnalysisTarget) {
    setTarget(nextTarget);
    setConfirmation("");
  }

  function handleAnalyze() {
    setError("");
    setConfirmation("");
    void engineRef.current
      ?.analyze({
        fen: targetFen,
        depth: normalizeEngineDepth(depth),
        timeoutMs: 12000,
      })
      .then(setResult)
      .catch((analysisError: unknown) => {
        setError(
          analysisError instanceof Error
            ? analysisError.message
            : "Engine analysis failed.",
        );
      });
  }

  function handleStop() {
    engineRef.current?.stop();
  }

  function handleClear() {
    setResult(null);
    setError("");
    setConfirmation("");
  }

  function handleAttach() {
    if (!visibleResult) {
      return;
    }

    if (target === "drill" && selectedCard) {
      onAttachToCard(selectedCard.id, visibleResult);
      setConfirmation(getAttachConfirmation("card"));
      return;
    }

    if (canAttachToAnnotation) {
      onAttachToAnnotation(visibleResult);
      setConfirmation(getAttachConfirmation("move"));
    }
  }

  return (
    <section className="grid gap-4 border-[1.5px] border-ink bg-paper-2 p-4">
      <div>
        <h2 className="text-lg font-semibold text-ink">Engine analysis</h2>
        <p className="text-sm text-ink-muted">
          Optional local Stockfish review for one selected position at a time.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          className={target === "active" ? "lf-chip-active" : "lf-chip"}
          onClick={() => selectTarget("active")}
        >
          Active board
        </button>
        <button
          className={target === "annotation" ? "lf-chip-active" : "lf-chip"}
          disabled={!canAttachToAnnotation}
          onClick={() => selectTarget("annotation")}
        >
          Move annotation
        </button>
        <button
          className={target === "drill" ? "lf-chip-active" : "lf-chip"}
          disabled={!selectedCard}
          onClick={() => selectTarget("drill")}
        >
          Selected card
        </button>
      </div>

      <div className="grid gap-2 bg-paper-2 p-3 text-sm">
        <div className="flex items-center justify-between gap-3">
          <span className="text-ink-muted">Target</span>
          <span className="text-ink">{targetLabel}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-ink-muted">Status</span>
          <span className="font-mono text-ink" role="status" aria-live="polite">
            {status}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-ink-muted">Depth</span>
          <span className="font-mono text-ink">{normalizeEngineDepth(depth)}</span>
        </div>
        <details>
          <summary className="cursor-pointer text-ink-muted">Target FEN</summary>
          <code className="mt-2 block break-all bg-paper-2 p-2 text-xs text-ink">
            {targetFen}
          </code>
        </details>
      </div>

      <label className="grid gap-1 text-sm">
        <span className="text-ink-muted">Analysis depth</span>
        <select
          className="lf-field"
          value={depth}
          onChange={(event) => {
            const nextDepth = normalizeEngineDepth(Number(event.target.value));
            setDepth(saveEngineDepthPreference(nextDepth));
          }}
        >
          {ENGINE_DEPTH_OPTIONS.map((depthOption) => (
            <option key={depthOption} value={depthOption}>
              Depth {depthOption}
            </option>
          ))}
        </select>
      </label>

      <div className="flex flex-wrap gap-2">
        <button
          className="lf-button-primary"
          disabled={status === "loading" || status === "analyzing"}
          onClick={handleAnalyze}
        >
          Analyze position
        </button>
        <button className="lf-button" disabled={status !== "analyzing"} onClick={handleStop}>
          Stop analysis
        </button>
        <button className="lf-button" onClick={handleClear}>
          Clear result
        </button>
        <button
          className="lf-button"
          disabled={
            !visibleResult ||
            (target !== "drill" && !canAttachToAnnotation) ||
            (target === "drill" && !selectedCard)
          }
          onClick={handleAttach}
        >
          {target === "drill" ? "Save to card" : "Save to move"}
        </button>
      </div>

      {error ? (
        <div className="border-l-4 border-spot pl-2 text-sm text-ink font-bold" role="alert">
          {error}
        </div>
      ) : null}
      <StatusHint message={confirmation} className="text-sm text-data" />
      {isResultStale ? (
        <div
          className="border-[1.5px] border-dashed border-spot bg-spot-tint p-3 text-sm text-ink"
          role="status"
          aria-live="polite"
        >
          This result belongs to a previous FEN.
        </div>
      ) : null}

      {visibleResult ? (
        <div className="grid gap-2 bg-paper-2 p-3 text-sm">
          <div className="bg-paper-2 p-2 text-xs text-ink-muted">
            {getStoredAnalysisLabel(visibleResultKind)}
          </div>
          <ResultRow
            label="Best move"
            value={`${visibleResult.bestMoveSan ?? visibleResult.bestMoveUci} (${visibleResult.bestMoveUci})`}
          />
          <ResultRow label="Evaluation" value={formatEvaluation(visibleResult.evaluation)} />
          <ResultRow label="Depth" value={String(visibleResult.depth)} />
          <ResultRow label="Nodes" value={visibleResult.nodes?.toLocaleString() ?? "Unknown"} />
          <ResultRow label="Engine" value={visibleResult.engineName} />
          <ResultRow
            label="Analyzed"
            value={formatAnalysisTimestamp(visibleResult.analyzedAt)}
          />
          {result ? (
            <ReviewSummary
              summary={buildExplanationSummary({
                moveSan: visibleResult.bestMoveSan,
                engineAnalysis: visibleResult,
                card:
                  target === "drill" && selectedCard
                    ? {
                        ply: selectedCard.ply,
                        attempts: selectedCard.attempts,
                        correct: selectedCard.correct,
                        attemptHistory: selectedCard.attemptHistory,
                      }
                    : undefined,
              })}
            />
          ) : null}
        </div>
      ) : (
        <div className="bg-paper-2 p-3 text-sm text-ink-muted">
          No analysis result yet.
        </div>
      )}
    </section>
  );
}

function ResultRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <span className="text-ink-muted">{label}</span>
      <span className="font-mono text-ink">{value}</span>
    </div>
  );
}

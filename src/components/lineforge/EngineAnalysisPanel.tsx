"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  formatEvaluation,
  LocalStockfishEngine,
} from "@/lib/engine/local-engine";
import type {
  EngineAnalysisResult,
  EngineStatus,
} from "@/lib/engine/types";
import type { MistakeCard } from "@/lib/move-ledger/types";

type AnalysisTarget = "active" | "drill";

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
  const [target, setTarget] = useState<AnalysisTarget>("active");
  const [result, setResult] = useState<EngineAnalysisResult | null>(null);
  const [error, setError] = useState("");

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
  const storedAnalysis = useMemo(() => {
    if (target === "drill") {
      return selectedCard?.engineAnalysis;
    }

    return currentAnnotationAnalysis;
  }, [currentAnnotationAnalysis, selectedCard, target]);
  const visibleResult = result ?? storedAnalysis ?? null;

  function handleAnalyze() {
    setError("");
    void engineRef.current
      ?.analyze({
        fen: targetFen,
        depth: 10,
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
  }

  function handleAttach() {
    if (!visibleResult) {
      return;
    }

    if (target === "drill" && selectedCard) {
      onAttachToCard(selectedCard.id, visibleResult);
      return;
    }

    if (canAttachToAnnotation) {
      onAttachToAnnotation(visibleResult);
    }
  }

  return (
    <section className="grid gap-4 rounded-lg border border-stone-800 bg-stone-950/80 p-4">
      <div>
        <h2 className="text-lg font-semibold text-stone-100">Engine analysis</h2>
        <p className="text-sm text-stone-500">
          Optional local Stockfish review for one selected position at a time.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          className={target === "active" ? "lf-chip-active" : "lf-chip"}
          onClick={() => setTarget("active")}
        >
          Active board
        </button>
        <button
          className={target === "drill" ? "lf-chip-active" : "lf-chip"}
          disabled={!selectedCard}
          onClick={() => setTarget("drill")}
        >
          Selected card
        </button>
      </div>

      <div className="grid gap-2 rounded-md bg-black/30 p-3 text-sm">
        <div className="flex items-center justify-between gap-3">
          <span className="text-stone-500">Status</span>
          <span className="font-mono text-amber-100">{status}</span>
        </div>
        <div>
          <div className="mb-1 text-stone-500">Position</div>
          <code className="block break-all rounded-md bg-black/35 p-2 text-xs text-amber-100">
            {targetFen}
          </code>
        </div>
      </div>

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
            (target === "active" && !canAttachToAnnotation) ||
            (target === "drill" && !selectedCard)
          }
          onClick={handleAttach}
        >
          {target === "drill" ? "Save to card" : "Save to move"}
        </button>
      </div>

      {error ? <div className="text-sm text-red-200">{error}</div> : null}

      {visibleResult ? (
        <div className="grid gap-2 rounded-md bg-black/30 p-3 text-sm">
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
            value={new Date(visibleResult.analyzedAt).toLocaleString()}
          />
        </div>
      ) : (
        <div className="rounded-md bg-black/30 p-3 text-sm text-stone-500">
          No analysis result yet.
        </div>
      )}
    </section>
  );
}

function ResultRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <span className="text-stone-500">{label}</span>
      <span className="font-mono text-stone-100">{value}</span>
    </div>
  );
}

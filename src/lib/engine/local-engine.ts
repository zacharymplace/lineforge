import { Chess, type Square } from "chess.js";
import type {
  EngineAnalysisRequest,
  EngineAnalysisResult,
  EngineEvaluation,
  EngineInfoSnapshot,
  EngineStatus,
} from "./types";

const ENGINE_WORKER_PATH = "/stockfish/stockfish-18-lite-single.js";
const ENGINE_NAME = "Stockfish 18 Lite Single";
const ENGINE_DEPTH_KEY = "lineforge.engine.depth.v1";
export const ENGINE_DEPTH_OPTIONS = [6, 8, 10, 12, 14] as const;
export type EngineDepthOption = (typeof ENGINE_DEPTH_OPTIONS)[number];
export type EngineTargetKind = "active" | "annotation" | "drill";

type StatusListener = (status: EngineStatus) => void;

export function formatEvaluation(evaluation: EngineEvaluation) {
  return evaluation.type === "mate"
    ? `M${evaluation.value}`
    : `${evaluation.value > 0 ? "+" : ""}${(evaluation.value / 100).toFixed(2)}`;
}

export function normalizeEngineDepth(depth: number): EngineDepthOption {
  return ENGINE_DEPTH_OPTIONS.includes(depth as EngineDepthOption)
    ? (depth as EngineDepthOption)
    : 10;
}

export function loadEngineDepthPreference(storage?: Pick<Storage, "getItem"> | null) {
  const source = storage ?? (typeof window !== "undefined" ? window.localStorage : null);

  if (!source) {
    return 10;
  }

  return normalizeEngineDepth(Number(source.getItem(ENGINE_DEPTH_KEY)));
}

export function saveEngineDepthPreference(
  depth: number,
  storage?: Pick<Storage, "setItem"> | null,
) {
  const source = storage ?? (typeof window !== "undefined" ? window.localStorage : null);
  const safeDepth = normalizeEngineDepth(depth);

  source?.setItem(ENGINE_DEPTH_KEY, String(safeDepth));
  return safeDepth;
}

export function formatAnalysisTimestamp(analyzedAt?: string) {
  if (!analyzedAt) {
    return "Unknown time";
  }

  const date = new Date(analyzedAt);
  return Number.isNaN(date.getTime()) ? "Unknown time" : date.toLocaleString();
}

export function getStoredAnalysisLabel(kind: "current" | "move" | "card") {
  if (kind === "current") return "Current unsaved engine result";
  if (kind === "move") return "Saved move analysis";
  return "Saved card analysis";
}

export function getAttachConfirmation(target: "move" | "card") {
  return target === "card" ? "Saved to card" : "Saved to move";
}

export function isStaleAnalysis(
  result: EngineAnalysisResult | null | undefined,
  currentFen: string,
) {
  return Boolean(result && result.fen !== currentFen);
}

export function getEngineTargetLabel(
  target: EngineTargetKind,
  canAttachToAnnotation: boolean,
  selectedCardLabel?: string,
) {
  if (target === "drill") {
    return selectedCardLabel ? `Selected drill card: ${selectedCardLabel}` : "Selected drill card";
  }

  if (target === "annotation" && canAttachToAnnotation) {
    return "Selected move annotation";
  }

  return "Active board position";
}

export function nextEngineStatus(
  current: EngineStatus,
  event: "load" | "ready" | "analyze" | "stop" | "error" | "reset",
): EngineStatus {
  if (event === "load") return "loading";
  if (event === "ready") return "ready";
  if (event === "analyze") return "analyzing";
  if (event === "stop") return current === "analyzing" ? "ready" : current;
  if (event === "error") return "error";
  return "idle";
}

export function attachAnalysisToCard<T extends { engineAnalysis?: EngineAnalysisResult }>(
  card: T,
  analysis: EngineAnalysisResult,
): T {
  return {
    ...card,
    engineAnalysis: analysis,
  };
}

export function attachAnalysisToAnnotation<
  T extends { engineAnalysis?: EngineAnalysisResult; updatedAt?: string },
>(annotation: T, analysis: EngineAnalysisResult): T {
  return {
    ...annotation,
    engineAnalysis: analysis,
    updatedAt: new Date().toISOString(),
  };
}

export function clearAnalysis<T extends { engineAnalysis?: EngineAnalysisResult }>(value: T): T {
  const { engineAnalysis, ...rest } = value;
  void engineAnalysis;
  return rest as T;
}

export function bestMoveSanFromUci(fen: string, uci: string) {
  try {
    const chess = new Chess(fen);
    const move = chess.move({
      from: uci.slice(0, 2) as Square,
      to: uci.slice(2, 4) as Square,
      promotion: uci[4],
    });

    return move.san;
  } catch {
    return undefined;
  }
}

export class LocalStockfishEngine {
  private worker: Worker | null = null;
  private status: EngineStatus = "idle";
  private listeners = new Set<StatusListener>();
  private pending:
    | {
        request: EngineAnalysisRequest;
        resolve: (result: EngineAnalysisResult) => void;
        reject: (error: Error) => void;
        timeoutId: ReturnType<typeof setTimeout>;
        latestInfo: EngineInfoSnapshot;
      }
    | null = null;

  subscribe(listener: StatusListener) {
    this.listeners.add(listener);
    listener(this.status);

    return () => {
      this.listeners.delete(listener);
    };
  }

  getStatus() {
    return this.status;
  }

  async analyze(request: EngineAnalysisRequest): Promise<EngineAnalysisResult> {
    await this.ensureReady();

    if (!this.worker) {
      throw new Error("Engine worker is not available.");
    }

    if (this.pending) {
      this.stop();
    }

    this.setStatus("analyzing");

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.stop();
        reject(new Error("Engine analysis timed out."));
      }, request.timeoutMs ?? 10000);

      this.pending = {
        request,
        resolve,
        reject,
        timeoutId,
        latestInfo: {
          depth: 0,
        },
      };

      this.post(`position fen ${request.fen}`);
      this.post(`go depth ${request.depth ?? 10}`);
    });
  }

  stop() {
    if (this.worker) {
      this.post("stop");
    }

    if (this.pending) {
      clearTimeout(this.pending.timeoutId);
      this.pending = null;
    }

    this.setStatus(this.worker ? "ready" : "idle");
  }

  dispose() {
    this.stop();
    this.worker?.terminate();
    this.worker = null;
    this.setStatus("idle");
  }

  private async ensureReady() {
    if (typeof window === "undefined") {
      throw new Error("Local engine can only run in the browser.");
    }

    if (this.worker && (this.status === "ready" || this.status === "analyzing")) {
      return;
    }

    this.setStatus("loading");

    await new Promise<void>((resolve, reject) => {
      const worker = new Worker(ENGINE_WORKER_PATH);
      const timeoutId = setTimeout(() => {
        worker.terminate();
        this.setStatus("error");
        reject(new Error("Engine failed to load."));
      }, 10000);

      worker.onmessage = (event: MessageEvent<string>) => {
        const line = String(event.data);

        if (line === "uciok") {
          this.post("isready");
          return;
        }

        if (line === "readyok") {
          clearTimeout(timeoutId);
          this.worker = worker;
          this.setStatus("ready");
          resolve();
          return;
        }

        this.handleLine(line);
      };

      worker.onerror = () => {
        clearTimeout(timeoutId);
        worker.terminate();
        this.setStatus("error");
        reject(new Error("Engine worker failed."));
      };

      this.worker = worker;
      this.post("uci");
    });
  }

  private handleLine(line: string) {
    if (line.startsWith("info ")) {
      this.handleInfo(line);
      return;
    }

    if (line.startsWith("bestmove ")) {
      this.handleBestMove(line);
    }
  }

  private handleInfo(line: string) {
    if (!this.pending) {
      return;
    }

    const depth = readNumberToken(line, "depth");
    const nodes = readNumberToken(line, "nodes");
    const evaluation = readEvaluation(line);

    this.pending.latestInfo = {
      depth: depth ?? this.pending.latestInfo.depth,
      nodes: nodes ?? this.pending.latestInfo.nodes,
      evaluation: evaluation ?? this.pending.latestInfo.evaluation,
    };
  }

  private handleBestMove(line: string) {
    if (!this.pending) {
      return;
    }

    const bestMoveUci = line.split(/\s+/)[1] ?? "";
    const { request, resolve, timeoutId, latestInfo } = this.pending;
    clearTimeout(timeoutId);
    this.pending = null;
    this.setStatus("ready");

    resolve({
      fen: request.fen,
      bestMoveUci,
      bestMoveSan: bestMoveSanFromUci(request.fen, bestMoveUci),
      evaluation: latestInfo.evaluation ?? { type: "cp", value: 0 },
      depth: latestInfo.depth,
      nodes: latestInfo.nodes,
      analyzedAt: new Date().toISOString(),
      engineName: ENGINE_NAME,
    });
  }

  private post(command: string) {
    this.worker?.postMessage(command);
  }

  private setStatus(status: EngineStatus) {
    this.status = status;
    for (const listener of this.listeners) {
      listener(status);
    }
  }
}

function readNumberToken(line: string, token: string) {
  const match = line.match(new RegExp(`\\b${token}\\s+(-?\\d+)`));
  return match ? Number(match[1]) : undefined;
}

function readEvaluation(line: string): EngineEvaluation | undefined {
  const cp = line.match(/\bscore\s+cp\s+(-?\d+)/);
  if (cp) {
    return {
      type: "cp",
      value: Number(cp[1]),
    };
  }

  const mate = line.match(/\bscore\s+mate\s+(-?\d+)/);
  if (mate) {
    return {
      type: "mate",
      value: Number(mate[1]),
    };
  }

  return undefined;
}

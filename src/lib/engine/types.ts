export type EngineStatus = "idle" | "loading" | "ready" | "analyzing" | "error";

export type EngineAnalysisRequest = {
  fen: string;
  depth?: number;
  timeoutMs?: number;
};

export type EngineEvaluation = {
  type: "cp" | "mate";
  value: number;
};

export type EngineBestMove = {
  uci: string;
  san?: string;
};

export type EngineAnalysisResult = {
  fen: string;
  bestMoveUci: string;
  bestMoveSan?: string;
  evaluation: EngineEvaluation;
  depth: number;
  nodes?: number;
  analyzedAt: string;
  engineName: string;
};

export type EngineInfoSnapshot = {
  depth: number;
  nodes?: number;
  evaluation?: EngineEvaluation;
};

import type { CSSProperties } from "react";

// The two square colours are fixed, so the coordinate labels sit on a fixed paper chip: no single text colour clears
// contrast on both squares (light-grey labels were 1.9:1 on the light squares). Shared so every board matches.
const notation: CSSProperties = {
  color: "#12110f",
  backgroundColor: "#f1efe8",
  fontSize: "10px",
  fontWeight: 700,
  lineHeight: 1.2,
  padding: "0 2px",
};

export const boardColors = {
  darkSquareStyle: { backgroundColor: "#6f5b43" },
  lightSquareStyle: { backgroundColor: "#d7c7a4" },
  alphaNotationStyle: notation,
  numericNotationStyle: notation,
};

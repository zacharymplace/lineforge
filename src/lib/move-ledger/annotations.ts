import type { MistakeTag, MoveAnnotation, MoveVerdict } from "./types";

export function createAnnotation(
  ply: number,
  thought: string,
  verdict: MoveVerdict,
  tags: MistakeTag[],
): MoveAnnotation {
  return {
    ply,
    thought,
    verdict,
    tags,
    updatedAt: new Date().toISOString(),
  };
}

export function emptyAnnotation(ply: number): MoveAnnotation {
  return createAnnotation(ply, "", "unclear", []);
}

export function toggleTag(tags: MistakeTag[], tag: MistakeTag) {
  return tags.includes(tag)
    ? tags.filter((currentTag) => currentTag !== tag)
    : [...tags, tag];
}

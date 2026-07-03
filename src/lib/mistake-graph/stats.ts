import { MISTAKE_TAGS, MOVE_VERDICTS, type MistakeStats } from "../move-ledger/types";
import type { MistakeCard } from "../move-ledger/types";

export function calculateMistakeStats(cards: MistakeCard[]): MistakeStats {
  const byVerdict = Object.fromEntries(
    MOVE_VERDICTS.map((verdict) => [verdict, 0]),
  ) as MistakeStats["byVerdict"];

  const tagCounts = Object.fromEntries(MISTAKE_TAGS.map((tag) => [tag, 0])) as Record<
    (typeof MISTAKE_TAGS)[number],
    number
  >;

  for (const card of cards) {
    byVerdict[card.verdict] += 1;
    for (const tag of card.tags) {
      tagCounts[tag] += 1;
    }
  }

  return {
    totalCards: cards.length,
    byVerdict,
    topTags: Object.entries(tagCounts)
      .map(([tag, count]) => ({ tag: tag as (typeof MISTAKE_TAGS)[number], count }))
      .filter((item) => item.count > 0)
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
      .slice(0, 5),
    recentCards: [...cards]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 5),
  };
}

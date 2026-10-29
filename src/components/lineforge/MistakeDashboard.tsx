"use client";

import { MOVE_VERDICTS, type MistakeStats } from "@/lib/move-ledger/types";
import {
  getSessionDashboardStats,
  type ReviewSessionSummary,
} from "@/lib/drill-queue/session";
import type { ReviewScheduleSummary } from "@/lib/drill-queue/schedule";
import type { OpeningWeaknessMap } from "@/lib/mistake-graph/opening-weakness-map";
import type { OpeningWeaknessTrend } from "@/lib/mistake-graph/opening-weakness-trends";
import { ScheduleBadge } from "./ScheduleBadge";

type MistakeDashboardProps = {
  stats: MistakeStats;
  sessionSummaries: ReviewSessionSummary[];
  openingMap: OpeningWeaknessMap;
  openingTrend: OpeningWeaknessTrend;
  reviewSchedule: ReviewScheduleSummary;
};

export function MistakeDashboard({
  stats,
  sessionSummaries,
  openingMap,
  openingTrend,
  reviewSchedule,
}: MistakeDashboardProps) {
  const sessionStats = getSessionDashboardStats(sessionSummaries);
  const scheduleItemsByCardId = new Map(
    reviewSchedule.items.map((item) => [item.cardId, item]),
  );

  return (
    <section className="grid gap-4 border-[1.5px] border-ink bg-paper-2 p-4">
      <div>
        <h2 className="text-lg font-semibold text-ink">MistakeGraph</h2>
        <p className="text-sm text-ink-muted">Card frequency and review results, shown separately. Recall and correction cards count separately; labels describe saved moves, not review failures.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div className="bg-paper-2 p-3">
          <div className="text-xs text-ink-muted">Total cards</div>
          <div className="text-2xl font-semibold text-ink">{stats.totalCards}</div>
        </div>
        {MOVE_VERDICTS.map((verdict) => (
          <div key={verdict} className="bg-paper-2 p-3">
            <div className="text-xs text-ink-muted">{verdict}</div>
            <div className="text-2xl font-semibold text-ink">
              {stats.byVerdict[verdict]}
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <div className="mb-2 text-sm text-ink-muted">Top tags</div>
          <div className="grid gap-2">
            {stats.topTags.length === 0 ? (
              <div className="text-sm text-ink-muted">No tagged cards yet.</div>
            ) : (
              stats.topTags.map((item) => (
                <div
                  key={item.tag}
                  className="flex items-center justify-between bg-paper-2 px-3 py-2 text-sm"
                >
                  <span>{item.tag}</span>
                  <span className="font-mono text-ink">{item.count}</span>
                </div>
              ))
            )}
          </div>
        </div>
        <div>
          <div className="mb-2 text-sm text-ink-muted">Most recent cards</div>
          <div className="grid gap-2">
            {stats.recentCards.length === 0 ? (
              <div className="text-sm text-ink-muted">No cards saved yet.</div>
            ) : (
              stats.recentCards.map((card) => (
                <div key={card.id} className="bg-paper-2 px-3 py-2 text-sm">
                  <div className="text-ink-2">
                    Ply {card.ply}: {card.moveSan}
                  </div>
                  <div className="text-xs text-ink-muted">{card.verdict}</div>
                  <div className="mt-2">
                    <ScheduleBadge item={scheduleItemsByCardId.get(card.id)} compact />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-3 bg-paper-2 p-3">
        <div>
          <div className="text-sm font-medium text-ink">Opening weakness map</div>
          <div className="text-xs text-ink-muted">
            {openingMap.summary.totalOpeningCards} opening cards · most frequent grouping{" "}
            {openingMap.summary.strongestBucket?.label ?? "none"}
          </div>
        </div>
        <p className="text-sm text-ink-muted">{openingMap.summary.reviewEvidence}</p>
        <div className="bg-paper px-3 py-2 text-sm text-ink-2">
          <span className="text-ink-muted">Next focus: </span>
          {openingMap.summary.recommendedNextReviewFocus}
        </div>
      </div>

      <div className="grid gap-3 bg-paper-2 p-3">
        <div>
          <div className="text-sm font-medium text-ink">Opening trend</div>
          <div className="text-xs text-ink-muted">
            latest opening review success {openingTrend.summary.latestSuccessRate}% · most missed{" "}
            {openingTrend.summary.mostMissedBucket?.bucketLabel ?? "none"}
          </div>
        </div>
        <div className="bg-paper px-3 py-2 text-sm text-ink-2">
          <span className="text-ink-muted">Recommended focus: </span>
          {openingTrend.summary.recommendedNextFocus}
        </div>
      </div>

      <div className="grid gap-3 bg-paper-2 p-3">
        <div>
          <div className="text-sm font-medium text-ink">Review schedule</div>
          <div className="text-xs text-ink-muted">
            {reviewSchedule.dueNowCount} due now · {reviewSchedule.dueSoonCount} due soon
          </div>
        </div>
        <div className="bg-paper px-3 py-2 text-sm text-ink-2">
          <span className="text-ink-muted">Next action: </span>
          {reviewSchedule.recommendedNextAction}
        </div>
      </div>

      <div className="grid gap-3 bg-paper-2 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-sm font-medium text-ink">Recent review sessions</div>
            <div className="text-xs text-ink-muted">
              {sessionStats.totalSessionsCompleted} completed · latest success{" "}
              {sessionStats.latestSuccessRate}%
            </div>
          </div>
        </div>
        {sessionStats.recentSessions.length === 0 ? (
          <div className="text-sm text-ink-muted">No completed sessions yet.</div>
        ) : (
          <div className="grid gap-2">
            {sessionStats.recentSessions.map((summary) => (
              <div
                key={summary.id}
                className="flex flex-wrap items-center justify-between gap-2 bg-paper px-3 py-2 text-sm"
              >
                <span className="text-ink-2">
                  {summary.remembered}/{summary.totalReviewed} remembered
                </span>
                <span className="text-xs text-ink-muted">
                  {new Date(summary.completedAt).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

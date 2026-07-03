"use client";

import { MOVE_VERDICTS, type MistakeStats } from "@/lib/move-ledger/types";
import {
  getSessionDashboardStats,
  type ReviewSessionSummary,
} from "@/lib/drill-queue/session";

type MistakeDashboardProps = {
  stats: MistakeStats;
  sessionSummaries: ReviewSessionSummary[];
};

export function MistakeDashboard({ stats, sessionSummaries }: MistakeDashboardProps) {
  const sessionStats = getSessionDashboardStats(sessionSummaries);

  return (
    <section className="grid gap-4 rounded-lg border border-stone-800 bg-stone-950/80 p-4">
      <div>
        <h2 className="text-lg font-semibold text-stone-100">MistakeGraph</h2>
        <p className="text-sm text-stone-500">A compact view of your recurring patterns.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div className="rounded-md bg-black/30 p-3">
          <div className="text-xs text-stone-500">Total cards</div>
          <div className="text-2xl font-semibold text-amber-100">{stats.totalCards}</div>
        </div>
        {MOVE_VERDICTS.map((verdict) => (
          <div key={verdict} className="rounded-md bg-black/30 p-3">
            <div className="text-xs text-stone-500">{verdict}</div>
            <div className="text-2xl font-semibold text-stone-100">
              {stats.byVerdict[verdict]}
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <div className="mb-2 text-sm text-stone-500">Top tags</div>
          <div className="grid gap-2">
            {stats.topTags.length === 0 ? (
              <div className="text-sm text-stone-500">No tagged cards yet.</div>
            ) : (
              stats.topTags.map((item) => (
                <div
                  key={item.tag}
                  className="flex items-center justify-between rounded-md bg-black/30 px-3 py-2 text-sm"
                >
                  <span>{item.tag}</span>
                  <span className="font-mono text-amber-100">{item.count}</span>
                </div>
              ))
            )}
          </div>
        </div>
        <div>
          <div className="mb-2 text-sm text-stone-500">Most recent cards</div>
          <div className="grid gap-2">
            {stats.recentCards.length === 0 ? (
              <div className="text-sm text-stone-500">No cards saved yet.</div>
            ) : (
              stats.recentCards.map((card) => (
                <div key={card.id} className="rounded-md bg-black/30 px-3 py-2 text-sm">
                  <div className="text-stone-200">
                    Ply {card.ply}: {card.moveSan}
                  </div>
                  <div className="text-xs text-stone-500">{card.verdict}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-3 rounded-md bg-black/30 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-sm font-medium text-stone-100">Recent review sessions</div>
            <div className="text-xs text-stone-500">
              {sessionStats.totalSessionsCompleted} completed · latest success{" "}
              {sessionStats.latestSuccessRate}%
            </div>
          </div>
        </div>
        {sessionStats.recentSessions.length === 0 ? (
          <div className="text-sm text-stone-500">No completed sessions yet.</div>
        ) : (
          <div className="grid gap-2">
            {sessionStats.recentSessions.map((summary) => (
              <div
                key={summary.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-stone-950 px-3 py-2 text-sm"
              >
                <span className="text-stone-200">
                  {summary.remembered}/{summary.totalReviewed} remembered
                </span>
                <span className="text-xs text-stone-500">
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

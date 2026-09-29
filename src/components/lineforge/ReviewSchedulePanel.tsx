"use client";

import { useRef, useState } from "react";
import {
  buildDueReviewCardIds,
  type ReviewScheduleSummary,
} from "@/lib/drill-queue/schedule";
import {
  getReviewSchedulePresetDescription,
  getReviewSchedulePresetLabel,
  REVIEW_SCHEDULE_INTERVAL_PRESETS,
  type ReviewScheduleIntervalPreset,
  type ReviewSchedulePreferences,
} from "@/lib/drill-queue/schedule-preferences";
import {
  clearTransientMessageState,
  createTransientMessageState,
  type TransientMessageState,
} from "@/lib/ui/transient-message";
import { ScheduleBadge } from "./ScheduleBadge";
import { StatusHint } from "./StatusHint";

type ReviewSchedulePanelProps = {
  schedule: ReviewScheduleSummary;
  preferences: ReviewSchedulePreferences;
  onPresetChange: (preset: ReviewScheduleIntervalPreset) => void;
  onStartDueReview: (cardIds: string[]) => void;
};

export function ReviewSchedulePanel({
  schedule,
  preferences,
  onPresetChange,
  onStartDueReview,
}: ReviewSchedulePanelProps) {
  const dueCardIds = buildDueReviewCardIds(schedule);
  const [savedMessage, setSavedMessage] = useState<TransientMessageState>({
    message: null,
    token: 0,
  });
  const savedMessageTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handlePresetChange(preset: ReviewScheduleIntervalPreset) {
    onPresetChange(preset);
    showSavedMessage();
  }

  function showSavedMessage() {
    setSavedMessage((currentMessage) => {
      const nextMessage = createTransientMessageState("Schedule saved locally", currentMessage);

      if (savedMessageTimeoutRef.current) {
        clearTimeout(savedMessageTimeoutRef.current);
      }

      savedMessageTimeoutRef.current = setTimeout(() => {
        setSavedMessage((messageState) =>
          clearTransientMessageState(messageState, nextMessage.token),
        );
      }, 2200);

      return nextMessage;
    });
  }

  return (
    <section className="grid gap-3 border-[1.5px] border-ink bg-paper-2 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-ink">Review schedule</h2>
          <p className="text-sm text-ink-muted">
            Local due cards from your attempts and session history.
          </p>
        </div>
        <button
          className="lf-button-primary"
          disabled={dueCardIds.length === 0}
          aria-label={`Start due review with ${dueCardIds.length} scheduled card${dueCardIds.length === 1 ? "" : "s"}`}
          onClick={() => onStartDueReview(dueCardIds)}
        >
          Start due review
        </button>
      </div>

      <div className="grid gap-2 border-[1.5px] border-ink bg-paper-2 p-3 text-sm">
        <div className="flex flex-wrap items-end gap-3">
          <label className="grid gap-1">
            <span className="text-xs text-ink-muted">Schedule cadence</span>
            <select
              className="lf-field min-w-40"
              value={preferences.preset}
              aria-describedby="schedule-cadence-description"
              onChange={(event) =>
                handlePresetChange(event.target.value as ReviewScheduleIntervalPreset)
              }
            >
              {REVIEW_SCHEDULE_INTERVAL_PRESETS.map((preset) => (
                <option key={preset} value={preset}>
                  {getReviewSchedulePresetLabel(preset)}
                </option>
              ))}
            </select>
          </label>
          <button
            className="lf-button text-xs"
            type="button"
            aria-label="Reset schedule cadence to Standard"
            onClick={() => handlePresetChange("standard")}
          >
            Reset cadence to Standard
          </button>
          <StatusHint message={savedMessage.message} />
        </div>
        <div id="schedule-cadence-description" className="text-xs text-ink-muted">
          {getReviewSchedulePresetDescription(preferences)}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label="Due now" value={schedule.dueNowCount} />
        <Metric label="Due soon" value={schedule.dueSoonCount} />
        <Metric label="Stable" value={schedule.stableCount} />
        <Metric label="New" value={schedule.newCount} />
      </div>

      <div className="border-[1.5px] border-ink bg-paper-2 p-3 text-sm text-ink-2">
        <span className="text-ink-muted">Next action: </span>
        {schedule.recommendedNextAction}
      </div>

      <div className="grid gap-2">
        <div className="text-sm font-medium text-ink">Top priority cards</div>
        {schedule.topPriorityItems.length === 0 ? (
          <div className="text-sm text-ink-muted">No mistake cards are scheduled yet.</div>
        ) : (
          schedule.topPriorityItems.map((item) => (
            <div
              key={item.cardId}
              className="grid gap-2 bg-paper-2 px-3 py-2 text-sm sm:grid-cols-[1fr_auto]"
            >
              <div>
                <div className="font-mono text-ink">
                  Ply {item.ply}: {item.moveSan}
                </div>
                <div className="text-xs text-ink-muted">
                  {item.verdict} · {item.tags.join(", ") || "no tags"}
                </div>
                <div className="mt-1 text-xs text-ink-muted">
                  {item.reasons.slice(0, 2).map((reason) => reason.label).join(" · ") ||
                    "No urgent scheduling reason."}
                </div>
              </div>
              <div className="flex flex-wrap items-start gap-2 sm:justify-end">
                <ScheduleBadge item={item} compact />
                <span
                  className="bg-paper px-2 py-1 font-mono text-xs text-ink"
                  aria-label={`Priority score ${item.priorityScore}`}
                >
                  {item.priorityScore}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-paper-2 p-3">
      <div className="text-xs text-ink-muted">{label}</div>
      <div className="text-2xl font-semibold text-ink">{value}</div>
    </div>
  );
}

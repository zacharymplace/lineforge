"use client";

import { useEffect, useId, useRef } from "react";
import {
  downloadReviewPacket,
  getReviewPacketFilename,
  getReviewPacketTitle,
  renderReviewPacketMarkdown,
  serializeReviewPacketJson,
} from "@/lib/review-packets/export";
import type { ReviewPacket } from "@/lib/review-packets/types";

type ReviewPacketPreviewModalProps = {
  packet: ReviewPacket;
  onClose: () => void;
};

export function ReviewPacketPreviewModal({ packet, onClose }: ReviewPacketPreviewModalProps) {
  const titleId = useId();
  const descriptionId = useId();
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const markdownPreview = renderReviewPacketMarkdown(packet);
  const jsonPreview = serializeReviewPacketJson(packet);

  useEffect(() => {
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButtonRef.current?.focus();

    return () => {
      previousFocusRef.current?.focus();
    };
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.key !== "Escape") {
        return;
      }

      event.preventDefault();
      onClose();
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto overscroll-contain bg-paper-2 px-4 py-6">
      <div
        className="grid max-h-[90vh] w-full max-w-3xl grid-rows-[auto_minmax(0,1fr)_auto] gap-4 overflow-hidden border-[1.5px] border-ink bg-paper p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-ink pb-3">
          <div>
            <h2
              id={titleId}
              className="text-lg font-semibold text-ink"
            >
              {getReviewPacketTitle(packet)}
            </h2>
            <p id={descriptionId} className="text-sm text-ink-muted">
              {packet.sourceType === "card" ? "Mistake card packet" : "Move packet"} ·{" "}
              {packet.sourceGameName ?? packet.sourceGameId ?? "Local LineForge data"}
            </p>
          </div>
          <button ref={closeButtonRef} className="lf-button" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="grid min-h-0 gap-3 overflow-auto pr-1">
          <div className="grid gap-2">
            <div className="text-sm font-medium text-ink-2">Markdown preview</div>
            <pre className="max-h-80 overflow-auto whitespace-pre-wrap border-[1.5px] border-ink bg-paper-2 p-3 text-xs leading-relaxed text-ink-2">
              {markdownPreview}
            </pre>
          </div>

          <details className="border-[1.5px] border-ink bg-paper-2 p-3">
            <summary className="cursor-pointer text-sm font-medium text-ink-2">
              JSON preview
            </summary>
            <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap bg-paper-2 p-3 text-xs leading-relaxed text-ink-2">
              {jsonPreview}
            </pre>
          </details>
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-ink pt-3">
          <button
            className="lf-button-primary"
            title={getReviewPacketFilename(packet, "markdown")}
            onClick={() => downloadReviewPacket(packet, "markdown")}
          >
            Download Markdown
          </button>
          <button
            className="lf-button"
            title={getReviewPacketFilename(packet, "json")}
            onClick={() => downloadReviewPacket(packet, "json")}
          >
            Download JSON
          </button>
        </div>
      </div>
    </div>
  );
}

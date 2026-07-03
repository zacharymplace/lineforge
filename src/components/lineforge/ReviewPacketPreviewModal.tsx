"use client";

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
  const markdownPreview = renderReviewPacketMarkdown(packet);
  const jsonPreview = serializeReviewPacketJson(packet);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 px-4 py-6">
      <div
        className="grid max-h-[90vh] w-full max-w-3xl gap-4 overflow-hidden rounded-lg border border-stone-700 bg-stone-950 p-4 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="review-packet-preview-title"
      >
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-stone-800 pb-3">
          <div>
            <h2
              id="review-packet-preview-title"
              className="text-lg font-semibold text-amber-100"
            >
              {getReviewPacketTitle(packet)}
            </h2>
            <p className="text-sm text-stone-500">
              {packet.sourceType === "card" ? "Mistake card packet" : "Move packet"} ·{" "}
              {packet.sourceGameName ?? packet.sourceGameId ?? "Local LineForge data"}
            </p>
          </div>
          <button className="lf-button" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="grid min-h-0 gap-3 overflow-auto pr-1">
          <div className="grid gap-2">
            <div className="text-sm font-medium text-stone-300">Markdown preview</div>
            <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-md border border-stone-800 bg-black/40 p-3 text-xs leading-relaxed text-stone-200">
              {markdownPreview}
            </pre>
          </div>

          <details className="rounded-md border border-stone-800 bg-black/30 p-3">
            <summary className="cursor-pointer text-sm font-medium text-stone-300">
              JSON preview
            </summary>
            <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded-md bg-black/50 p-3 text-xs leading-relaxed text-stone-300">
              {jsonPreview}
            </pre>
          </details>
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-stone-800 pt-3">
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

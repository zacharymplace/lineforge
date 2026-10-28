"use client";

import { useRef, useState } from "react";
import { parseBackupJson } from "@/lib/move-ledger/backup";
import { StatusHint } from "./StatusHint";

type BackupPanelProps = {
  onExport: () => string;
  onImport: (json: string) => string | null;
};

export function BackupPanel({ onExport, onImport }: BackupPanelProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const requestId = useRef(0);
  const [reading, setReading] = useState(false);
  const [preview, setPreview] = useState<{
    json: string; filename: string; games: number; cards: number;
  } | null>(null);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  function handleExport() {
    const json = onExport();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `lineforge-backup-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setMessage("Backup exported.");
    setIsError(false);
  }

  function cancelPreview() {
    requestId.current += 1;
    setReading(false);
    setPreview(null);
    setMessage("Restore cancelled. Current study data is unchanged.");
    setIsError(false);
  }

  async function handleFile(file: File | undefined) {
    const id = ++requestId.current;
    setPreview(null);
    setIsError(false);
    if (inputRef.current) inputRef.current.value = "";
    if (!file) {
      setReading(false);
      setMessage("");
      return;
    }
    setReading(true);
    setMessage("Reading backup. Current study data is unchanged.");
    try {
      const json = await file.text();
      if (id !== requestId.current) return;
      const backup = parseBackupJson(json);
      setPreview({ json, filename: file.name, games: backup.savedGames.length, cards: backup.mistakeCards.length });
      setMessage("Backup preview ready. Apply is required to replace current study data.");
    } catch (error) {
      if (id !== requestId.current) return;
      setMessage(error instanceof Error ? error.message : "Could not read that backup.");
      setIsError(true);
    } finally {
      if (id === requestId.current) setReading(false);
    }
  }

  function applyPreview() {
    if (!preview || reading) return;
    // Keep the existing import handler's validation and replacement semantics.
    const error = onImport(preview.json);
    setMessage(error ?? "Backup applied to this tab. Check the local save status above before closing or reloading.");
    setIsError(Boolean(error));
    if (!error) setPreview(null);
  }

  return (
    <section className="grid gap-4 border-[1.5px] border-ink bg-paper-2 p-4">
      <div>
        <h2 className="text-lg font-semibold text-ink">Backup</h2>
        <p className="text-sm text-ink-muted">Export or restore local LineForge data as JSON.</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button className="lf-button-primary" onClick={handleExport}>
          Export JSON
        </button>
        <input
          ref={inputRef}
          className="lf-field max-w-sm"
          type="file"
          aria-label="Choose LineForge backup"
          accept="application/json,.json"
          onChange={(event) => void handleFile(event.target.files?.[0])}
        />
      </div>
      {reading && <button className="lf-button-secondary" onClick={cancelPreview}>Cancel</button>}
      {preview && (
        <section aria-label="Backup replacement preview" className="grid min-w-0 gap-3 border border-ink p-3">
          <h3 className="font-semibold">Replace current study data?</h3>
          <p className="break-all">{preview.filename}</p>
          <p>Incoming: {preview.games} saved games · {preview.cards} mistake cards</p>
          <p>This replaces your current game library, mistake cards and active study game, including unsaved game changes. It does not merge them. Export your current data first if you want to keep it.</p>
          <div className="flex flex-wrap gap-2">
            <button className="lf-button-primary" onClick={applyPreview}>Apply replacement</button>
            <button className="lf-button-secondary" onClick={cancelPreview}>Cancel</button>
          </div>
        </section>
      )}
      {isError && message ? (
        <div className="border-l-4 border-spot pl-2 text-sm text-ink font-bold" role="alert">
          {message}
        </div>
      ) : (
        <StatusHint message={message} className="text-sm text-ink-muted" />
      )}
    </section>
  );
}

"use client";

import { useRef, useState } from "react";

type BackupPanelProps = {
  onExport: () => string;
  onImport: (json: string) => string | null;
};

export function BackupPanel({ onExport, onImport }: BackupPanelProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
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

  async function handleFile(file: File | undefined) {
    if (!file) {
      return;
    }

    const error = onImport(await file.text());
    setMessage(error ?? "Backup imported.");
    setIsError(Boolean(error));
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }

  return (
    <section className="grid gap-4 rounded-lg border border-stone-800 bg-stone-950/80 p-4">
      <div>
        <h2 className="text-lg font-semibold text-stone-100">Backup</h2>
        <p className="text-sm text-stone-500">Export or restore local LineForge data as JSON.</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button className="lf-button-primary" onClick={handleExport}>
          Export JSON
        </button>
        <input
          ref={inputRef}
          className="lf-field max-w-sm"
          type="file"
          accept="application/json,.json"
          onChange={(event) => void handleFile(event.target.files?.[0])}
        />
      </div>
      {message ? (
        <div className={`text-sm ${isError ? "text-red-200" : "text-stone-400"}`}>
          {message}
        </div>
      ) : null}
    </section>
  );
}

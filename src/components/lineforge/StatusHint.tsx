"use client";

type StatusHintProps = {
  message?: string | null;
  className?: string;
};

export function StatusHint({ message, className = "text-xs text-emerald-300" }: StatusHintProps) {
  if (!message) {
    return null;
  }

  return (
    <div className={className} role="status" aria-live="polite">
      {message}
    </div>
  );
}

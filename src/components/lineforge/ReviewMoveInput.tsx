"use client";
import { useState } from "react";

export function ReviewMoveInput({ onAttempt }: { onAttempt: (san: string) => void }) {
  const [san, setSan] = useState("");
  return <form className="flex flex-wrap gap-2" onSubmit={event => { event.preventDefault(); if (san.trim()) onAttempt(san); }}>
    <label className="grid gap-1 text-sm">Your move<input className="lf-field" value={san} required onChange={event => setSan(event.target.value)} placeholder="Chess notation, including promotion" /></label>
    <button className="lf-button-primary">Check move</button>
  </form>;
}

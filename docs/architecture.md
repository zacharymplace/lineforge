# LineForge Architecture

LineForge is a Next.js App Router TypeScript app with a local-first data model. Browser `localStorage` is the persistence layer for the current MVP.

## MoveLedger

MoveLedger owns game and move state:

- PGN import preview and board scrubber
- saved game library
- active/draft game state
- move annotations
- backup import/export validation
- localStorage read/write helpers

Key files live under `src/lib/move-ledger`.

## MistakeGraph

MistakeGraph owns mistake cards and aggregate mistake statistics:

- card creation from a selected ply
- card fields such as FEN before/after, move SAN, prompt, note, tags, verdict, attempts, correct, and review history
- dashboard stats by verdict, tag, and recency

Key files live under `src/lib/mistake-graph`.

## DrillQueue

DrillQueue owns active review behavior:

- showing the card position before the saved move
- evaluating a played answer
- appending attempt history
- keeping summary attempts/correct counts consistent

Key files live under `src/lib/drill-queue`.

## Engine

Engine owns optional local Stockfish analysis:

- local browser engine adapter
- status transitions
- depth preferences
- evaluation formatting
- stale result checks
- attaching/clearing analysis on annotations and cards

Key files live under `src/lib/engine`.

## Explanations

Explanations owns deterministic review summaries. It uses only saved structured data such as move SAN, verdict, tags, user note, engine result, and card review stats.

Key files live under `src/lib/explanations`.

## CoachLenses

CoachLenses owns deterministic learning perspectives:

- Blunder Audit
- Tactics
- King Safety
- Trade Check
- Opening Minimalist
- Plan Mismatch

It also provides comparison helpers for up to three selected lenses.

Key files live under `src/lib/coach-lenses`.

## ReviewPackets

ReviewPackets owns local export artifacts:

- packet models
- move/card packet builders
- Markdown rendering
- JSON serialization
- safe filenames
- browser download helper

Key files live under `src/lib/review-packets`.

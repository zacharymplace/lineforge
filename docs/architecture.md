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
- deterministic opening weakness maps from early-game cards
- opening weakness filters, reset state, and filter preferences
- opening weakness trends over local review history

Key files live under `src/lib/mistake-graph`.

## OpeningWeaknessMap

OpeningWeaknessMap is part of MistakeGraph and focuses on early-game local patterns. It treats cards with `ply <= 20` as opening-phase cards and groups them into deterministic buckets:

- opening confusion
- plan mismatch
- missed tactic
- bad trade
- king safety
- blunder
- unclear

It uses only saved structured data: cards, plies, move SAN, verdicts, tags, review stats, recent attempts, source game ids/names, and optional engine fields. It does not infer named openings.

The filter layer supports missed only, remembered only, current active saved game only, selected verdict, and selected tag. Filter preferences are stored in browser localStorage.

Opening weakness trends group local review attempts and skipped session results by date and deterministic bucket. Trend summaries identify latest success rate, most missed bucket, improving/worsening buckets, and recommended next focus without inferring named openings.

## DrillQueue

DrillQueue owns active review behavior:

- showing the card position before the saved move
- evaluating a played answer
- appending attempt history
- keeping summary attempts/correct counts consistent
- deterministic review scheduling from card attempt history and session results
- statuses such as due now, due soon, new, and stable
- priority scoring from missed attempts, low success rate, important verdicts/tags, never-reviewed cards, and recent skipped results
- due-review session creation from scheduled cards
- schedule badges on mistake-card surfaces
- DrillQueue combined filters for due status, source game, and last-reviewed recency
- active filter chip helpers for non-default DrillQueue filters
- selected-card fallback when the active card is hidden by filters
- persisted due-status filter preference
- review sessions built from filters, bucket card ids, or missed-only repeats
- session sizing with persisted preferred size
- completed session summaries and session history detail
- clearing session history without deleting cards, games, annotations, or attempts

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

It also provides comparison helpers for up to three selected lenses and persists the preferred comparison locally.

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

## Preferences And LocalStorage Helpers

LineForge keeps core data and lightweight preferences browser-local. Current preferences include:

- engine depth
- coach lens comparison selection
- review-session size
- opening weakness map filters
- DrillQueue due-status filter

These helpers validate restored values and fall back to safe defaults when localStorage data is missing, malformed, or invalid. DrillQueue source-game and last-reviewed filters are session-local by design and do not add localStorage keys.

## UI Helpers

Small UI helpers keep repeated status surfaces consistent:

- `ScheduleBadge` renders local schedule status, priority, success rate, last reviewed context, and recommended card action.
- `StatusHint` renders subtle saved/status hints with `role="status"` and `aria-live="polite"`.

These are intentionally local UI primitives, not a global notification system.

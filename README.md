# LineForge

A local-first chess memory system for turning games into reviewable decisions.

**Product thesis:** Lichess is where you play. LineForge is where your chess memory compounds.

LineForge is a private post-game study app. It helps you import games, inspect the moves before replacing your board, annotate what you thought, create mistake cards from your own positions, review those cards by playing the move, map recurring opening weaknesses, and export compact learning artifacts.

## Core Loop

1. Import a PGN.
2. Preview metadata and scrub the game on a small board.
3. Save the game to the local library.
4. Annotate a move with your thought, verdict, and tags.
5. Create a mistake card from the position.
6. Review the card by playing the remembered move.
7. Attach optional local Stockfish analysis to selected positions.
8. Generate deterministic review summaries.
9. Compare deterministic coach lenses.
10. Drill individual cards or run filtered review sessions.
11. Repeat missed cards and inspect session history.
12. Map and filter opening weaknesses.
13. Export review packets as Markdown or JSON.
14. Back up local data as JSON.

## Features

### Local-First Saved Game Library

Save multiple games locally with names, PGNs, move lists, timestamps, and annotations. Draft, saved, and unsaved states are visible, with reload/discard and rename flows for saved games.

### PGN Import Preview

Paste a PGN, inspect detected metadata, preview first/last moves, and scrub through the imported game on a smaller board before confirming. Invalid PGNs do not replace the active board.

### Move Annotations

Each ply can store:

- what you thought was happening
- verdict: good, mistake, blunder, unclear
- tags such as missed tactic, hung piece, king safety, bad trade, opening confusion, time pressure, and plan mismatch
- optional saved local engine analysis

### Mistake Cards

Create drill cards from your own positions. Cards preserve source game id, ply, FEN before/after, move SAN, prompt, note, tags, verdict, creation time, review stats, attempt history, and optional analysis.

### Drill Review

Select a card, see the position before the move, and try to play the answer on the board. Correct attempts are marked remembered; incorrect attempts are marked missed and reveal the expected move.

### Attempt History

Each drill attempt records when it happened, the attempted move/FEN when available, expected move, result, and whether it was played or manually revealed. Summary stats stay derived from that history.

### Review Sessions

Run focused sessions from filtered mistake-card queues. Sessions support filters, a persisted size selector, remembered/missed/skipped results, missed-only repeat sessions, completed summaries, and a history detail view with per-card results.

### Optional Local Stockfish Analysis

Engine analysis is user-triggered, one position at a time, and runs locally in the browser through Stockfish. It can be attached to a move annotation or mistake card, but it is not required for the core study loop.

### Deterministic Review Summaries

LineForge turns saved notes, tags, verdicts, review history, and engine fields into factual summaries. These summaries are template-driven and conservative; they do not pretend to know more than the saved data supports.

### Coach Lenses

Coach lenses reframe the same move or card through deterministic perspectives:

- Blunder Audit
- Tactics
- King Safety
- Trade Check
- Opening Minimalist
- Plan Mismatch

### Lens Comparison

Compare up to three coach lenses side by side for the same position. The default comparison is Blunder Audit, Tactics, and Plan Mismatch, and the preferred comparison persists locally.

### Opening Weakness Map

LineForge builds a deterministic opening weakness map from local early-game cards where `ply <= 20`. Buckets include opening confusion, plan mismatch, missed tactic, bad trade, king safety, blunder, and unclear.

The map can be filtered by missed only, remembered only, current active saved game only, selected verdict, and selected tag. Filters can be reset, preferences persist locally, and review sessions can start from a selected bucket or all visible filtered cards.

LineForge does not infer named openings; the map reflects only saved local cards, tags, verdicts, review stats, and optional engine fields.

### Review Packet Export

Export a selected move or drill card as a compact review packet. The preview modal shows Markdown and collapsible JSON before download. Packets can include review summaries, selected coach lens output, compared lens outputs, analysis, tags, notes, and review history.

### JSON Backup/Export

Export all local LineForge data as JSON and import it later. Backup validation checks the top-level shape, saved games, cards, attempts, FEN strings, and PGN legality where practical.

## What LineForge Is Not

LineForge is not:

- a Chess.com clone
- a Lichess replacement
- a multiplayer server
- an AI coach wrapper
- a cloud-first training product

LineForge is:

- a private chess notebook
- a mistake memory system
- a review queue built from your own games
- a deterministic coach lens system
- a portable learning artifact generator

## Architecture

LineForge uses small internal domains:

- **MoveLedger**: game state, PGN import, saved game library, annotations, localStorage, and backup data.
- **MistakeGraph**: mistake cards, aggregate mistake statistics, and opening weakness maps.
- **DrillQueue**: active card review, move-answer evaluation, attempt history, review sessions, session history, and session preferences.
- **Engine**: optional local Stockfish adapter, engine result formatting, depth preferences, and analysis attachment helpers.
- **Explanations**: deterministic review summaries and drill recommendations.
- **CoachLenses**: deterministic learning perspectives, lens comparison, and comparison preferences.
- **ReviewPackets**: compact JSON/Markdown packet construction, preview, filenames, and local download.
- **Preferences/localStorage helpers**: browser-local preferences for engine depth, coach lens comparison, review-session size, and opening weakness filters.

More detail lives in [`docs/architecture.md`](docs/architecture.md).

## Local Development

Install dependencies:

```bash
npm install
```

Run the app locally:

```bash
npm run dev
```

Run validation:

```bash
npm run test:lineforge-smoke
npm run lint
npm run build
```

## Privacy And Local-First Boundaries

- Core study data is stored in browser `localStorage`.
- Browser-local preferences store engine depth, coach lens comparison, review-session size, and opening weakness map filters.
- Backup/export uses local JSON files.
- Review packets download as local Markdown or JSON.
- Engine analysis uses local browser Stockfish and is optional.
- This version has no accounts, no cloud sync, no multiplayer, no payments, no external AI calls, and no LLM-generated explanations.

## Third-Party And Licensing Notes

LineForge uses:

- `chess.js` for chess rules, legal moves, FEN, and PGN handling.
- `react-chessboard` for board rendering and interaction.
- `stockfish` for optional local browser engine analysis.

See [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) for the Stockfish package/license note.

## Roadmap

Disciplined next steps:

- Add a visual saved hint for opening filter preference changes.
- Add a stronger focus trap/dialog primitive if more modals are added.
- Add a review calendar or scheduling layer.
- Add opening weakness trends over time.
- Add an optional AI coach layer only after deterministic review logic remains stable.

See [`docs/roadmap.md`](docs/roadmap.md) for more detail.

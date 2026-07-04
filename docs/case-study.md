# LineForge Case Study

LineForge is a local-first chess memory system for turning games into reviewable decisions.

## Product Thesis

Lichess is where you play. LineForge is where your chess memory compounds.

The product is built around a narrow post-game loop: import a game, preserve what you thought, turn mistakes into drill cards, review the positions, and export compact learning artifacts.

## Problem

Online chess sites are excellent for playing games, but post-game improvement often gets scattered across engine tabs, forgotten notes, and generic puzzle queues. A player may see that a move was bad without building a durable memory of why they made it or how that mistake repeats across their own games.

LineForge focuses on the private study layer after play. It helps a player turn their own games into a structured notebook, review queue, and mistake map.

## Differentiation

LineForge is not a Chess.com clone, a Lichess replacement, a multiplayer server, or an AI coach wrapper. It is intentionally local-first and deterministic.

It is:

- a private chess notebook
- a mistake memory system
- a review queue built from the user's own games
- a deterministic coach lens system
- a portable review packet generator

## Core Workflow

The first-run path starts without requiring outside data:

1. Try the demo game in the Play workflow.
2. Preview metadata, move snippets, and scrub the imported game.
3. Confirm import to create an unsaved draft.
4. Save the game locally if desired.
5. Annotate a move with a thought, verdict, and tags.
6. Create a mistake card from that position.
7. Optionally analyze the selected position with local Stockfish.
8. Review the card by playing the remembered move.
9. Run focused review sessions or due-review sessions.
10. Inspect opening weakness maps and trends.
11. Export a review packet or JSON backup.

## Architecture Highlights

LineForge uses small internal domains rather than a single large application component:

- **MoveLedger** owns PGN import, preview, saved games, active drafts, annotations, storage, and backup validation.
- **MistakeGraph** owns mistake cards, dashboard stats, opening weakness maps, filters, and trends.
- **DrillQueue** owns card review, played-answer evaluation, attempt history, review sessions, local scheduling, badges, and filters.
- **Engine** owns optional local Stockfish analysis for one selected position at a time.
- **Explanations** owns deterministic review summaries from saved structured data.
- **CoachLenses** owns deterministic learning perspectives and lens comparison.
- **ReviewPackets** owns JSON/Markdown packet construction, preview, filenames, and downloads.

The app uses Next.js App Router, TypeScript, React, `chess.js`, `react-chessboard`, browser `localStorage`, and optional local browser Stockfish.

## Local-First And Privacy Decisions

LineForge keeps core data in browser `localStorage`. Backup and review packet exports are local files. Engine analysis is optional, position-scoped, and local to the browser. There are no accounts, cloud sync, multiplayer features, payments, external AI calls, notifications, or calendar integrations in this version.

Browser-local preferences are limited to small usability settings such as engine depth, coach lens comparison selection, review-session size, review schedule preset, opening weakness filters, and DrillQueue due-status filter.

## Deterministic Review Logic

LineForge deliberately avoids generated coaching claims. Review summaries and coach lenses use templates over saved structured data:

- move SAN
- verdict
- tags
- user note
- engine best move and evaluation when saved
- review attempt history
- session results
- opening weakness buckets

The result is conservative and inspectable. For example, LineForge can say that a card tagged `king safety` has been missed repeatedly, or that a local engine result prefers a specific move at a saved depth. It does not invent strategic explanations beyond the available data.

## Intentionally Excluded

The current product excludes:

- multiplayer
- accounts
- cloud sync
- payments or subscriptions
- external services
- LLM calls or AI explanations
- named opening inference
- calendar integration or notifications
- automatic whole-game engine analysis

These exclusions keep the core memory loop private, fast, and easy to reason about.

## Screenshot Plan

Recommended screenshots for a public portfolio page:

- Play / PGN import: demo game preview and board scrubber.
- Study / annotation + engine: annotated move, optional saved analysis, deterministic summary.
- Review / DrillQueue + schedule: schedule badges, filters, and active card review.
- Weaknesses / opening map + trends: buckets, filters, and trend summary.
- Data / backup + review packets: packet preview modal and local export controls.

Use [`demo-walkthrough.md`](demo-walkthrough.md) to produce these screenshots from the built-in demo game.

## Roadmap

Near-term public-facing work should focus on presentation and verification:

- capture a consistent screenshot set
- write a sample-data walkthrough using the built-in demo game
- integrate the case study into a portfolio page
- consider an optional deployed static demo only after licensing and deployment constraints are handled
- refine opening weakness trends and scheduling clarity
- add an optional AI coach layer only after the deterministic core remains stable

See [`roadmap.md`](roadmap.md) for the active implementation roadmap.

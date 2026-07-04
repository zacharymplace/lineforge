# LineForge Product Brief

LineForge is a local-first chess memory system for turning games into reviewable decisions.

The product is built around a simple belief: playing sites are excellent at hosting games, but improvement compounds when a player remembers their own recurring decisions. LineForge focuses on the post-game loop: import, inspect, annotate, drill, compare, map recurring weaknesses, and export.

## Thesis

Lichess is where you play. LineForge is where your chess memory compounds.

## Primary User

A player who already plays online and wants a private, structured way to study their own games without creating another account, joining a multiplayer platform, or relying on cloud analysis.

## Core Value

LineForge turns raw games into:

- a saved local game library
- annotated decision records
- mistake cards from real positions
- active drill attempts
- review sessions with missed-only repeats
- inspectable review-session history
- local deterministic due-review scheduling
- schedule badges and DrillQueue filtering by due status, source game, and review recency
- deterministic review summaries
- deterministic coach lens comparisons
- deterministic opening weakness maps
- portable review packets

## Current Product Loop

1. Import a PGN.
2. Preview metadata, first/last moves, and scrub the game on a preview board.
3. Save the game to the local library.
4. Annotate moves with thoughts, verdicts, and tags.
5. Create mistake cards from selected positions.
6. Attach optional local Stockfish analysis to selected moves or cards.
7. Generate deterministic summaries from saved structured data.
8. Compare deterministic coach lenses.
9. Drill individual cards by playing the move.
10. Run filtered review sessions with a persisted size preference.
11. Repeat missed cards and inspect session history.
12. Review locally scheduled due cards.
13. Filter DrillQueue by due status, source game, and last-reviewed recency.
14. Map opening weaknesses from early-game cards.
15. Filter opening weakness buckets and review visible cards.
16. Inspect opening weakness trends.
17. Export review packets and backup local data.

## Review Sessions

Review sessions let users drill multiple cards in a focused pass. A session can be built from all cards, verdict/tag filters, missed-recently cards, lowest success rate, most recent cards, missed-only repeats, or opening weakness buckets.

The session size selector supports `5`, `10`, `15`, and `all`, and the preferred size persists in browser localStorage. Completed sessions store summaries with reviewed, remembered, missed, skipped, success rate, top missed tags, recommended next action, and compact per-card result details. Session history can be inspected or cleared without deleting games, cards, annotations, or review attempts.

## Review Scheduling

LineForge builds a local deterministic schedule from mistake-card review history and session results. Cards can be classified as due now, due soon, new, or stable. Priority scoring uses only local data: missed last attempt, low success rate, never-reviewed state, blunder verdicts, priority tags such as missed tactic and king safety, and recent skipped session results.

The schedule panel can start a due-review session. It chooses due-now cards first, then due-soon cards, then new cards if no due cards are available.

Users can choose a local scheduling preset:

- Gentle: a less aggressive cadence with fewer urgent cards and a longer stable window.
- Standard: the default/current scheduling behavior.
- Intense: a more aggressive cadence that surfaces skipped, stale, and lower-success cards sooner.

The selected preset persists locally, invalid saved preferences normalize safely, and reset restores Standard. This is not a calendar system: there are no notifications, no external calendar integration, no cloud scheduling, and no custom numeric scheduling controls in this version.

## Schedule Badges And DrillQueue Filtering

Mistake-card surfaces show text-based schedule badges with review status, priority label, success rate, last reviewed date, and a short recommended action. Badges are derived from the same shared schedule helpers used by the schedule panel.

DrillQueue can combine:

- due-status filters: all cards, due now, due soon, new, stable, and high priority
- source-game filters: all games, current active saved game, and saved games with cards
- last-reviewed filters: all cards, never reviewed, reviewed today, reviewed in the last 7 days, and not reviewed in 7+ days

Filtering is non-mutating. If the selected card is hidden, DrillQueue selects the first visible card when available; if no cards match, it shows a clear empty state. Non-default filters appear as compact chips, and each chip can clear one filter without resetting the others. Reset filters clears the full DrillQueue filter state.

The due-status filter persists locally and shows "Filter saved locally" after changes. Source-game and last-reviewed filters are intentionally session-local so they do not add more persistent preference state.

## Opening Weakness Map

The opening weakness map is deterministic and local. It uses early-game mistake cards where `ply <= 20` and groups them into these buckets:

- opening confusion
- plan mismatch
- missed tactic
- bad trade
- king safety
- blunder
- unclear

The map can be filtered by missed only, remembered only, current active saved game only, verdict, and tag. Filters can be reset to defaults, persist locally, and can start review sessions from a selected bucket or all visible filtered cards.

LineForge does not infer named openings. The map reflects saved tags, verdicts, review stats, moves, and optional engine fields only.

## Opening Weakness Trends

Opening weakness trends group local opening-card review attempts and skipped session results by date and bucket. The trend view summarizes latest success, most missed bucket, improving/worsening buckets, and recommended next focus. Trend focus buckets can start review sessions.

## Local Preferences

LineForge stores lightweight browser-local preferences for:

- engine depth
- coach lens comparison selection
- review-session size
- review schedule preset
- opening weakness map filters
- DrillQueue due-status filter

DrillQueue source-game and last-reviewed filters are session-local by design. They help inspection in the current session without expanding the durable preference surface.

Saved preference hints use a shared accessible `StatusHint` with polite status semantics, so messages such as "Filter saved locally" and "Filters saved locally" remain subtle while still being exposed to assistive technology.

## Product Boundaries

LineForge is intentionally not a playing server, social network, subscription product, calendar app, notification system, or AI coach wrapper. The current product is local-first and deterministic, with optional local engine assistance for selected positions only.

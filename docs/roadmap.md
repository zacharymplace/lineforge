# LineForge Roadmap

This roadmap keeps LineForge focused on the local-first review loop before expanding into broader coaching features.

## Near Term

- Capture a consistent screenshot set for Play, Study, Review, Weaknesses, and Data workflows.
- Add a sample-data walkthrough that starts with the built-in demo game.
- Integrate the case study into a portfolio page.
- Consider an optional deployed static demo only after licensing and deployment constraints are handled.
- Review other transient error/status messages for polite status semantics.
- Add a stronger focus trap/dialog primitive if more modals are added.
- Run a broader accessibility review for complex flows.

## Study Depth

- Add a local review calendar layer without external calendar integration first.
- Add optional custom numeric scheduling controls.
- Refine opening weakness trends over time.
- Improve packet preview with optional copy-to-clipboard actions.

## Engine-Assisted Review

- Keep analysis user-triggered and position-scoped.
- Add clearer stored-analysis comparison when a move has both human notes and engine data.
- Avoid automatic whole-game analysis until the local memory loop is stable.

## Completed Foundations

- First-run demo PGN with safe preview/confirm import flow.
- Workflow navigation and responsive layout polish.
- Persisted coach lens comparison preferences.
- Review-session mode with sizing, missed-only repeat, summaries, and history detail.
- Local deterministic review scheduling, due-review sessions, and schedule priority scoring.
- Configurable local scheduling presets: Gentle, Standard, and Intense.
- Schedule badges across mistake-card surfaces.
- DrillQueue due-status filter, selected-card fallback, empty filtered states, and persisted due-status preference.
- DrillQueue source-game and last-reviewed filters.
- Active DrillQueue filter chips with individual chip clearing and reset-all behavior.
- Opening weakness map using early-game cards where `ply <= 20`.
- Opening weakness filters, reset control, filtered review sessions, and persisted filter preferences.
- Opening weakness trends from local review history.
- Accessible saved hints using shared polite `StatusHint` semantics.

## Optional AI Layer

An AI coach layer should come only after deterministic review logic remains stable. If added, it should be optional, clearly labeled, privacy-conscious, and subordinate to the saved user data rather than replacing it.

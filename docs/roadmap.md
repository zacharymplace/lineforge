# LineForge Roadmap

This roadmap keeps LineForge focused on the local-first review loop before expanding into broader coaching features.

## Near Term

- Add a visual saved hint for opening weakness filter preference changes.
- Add a stronger focus trap/dialog primitive if more modals are added.
- Improve packet preview with optional copy-to-clipboard actions.

## Study Depth

- Add a review calendar or lightweight scheduling layer derived from attempt history.
- Add opening weakness trends over time.
- Add more drill queue filters for success rate, last reviewed date, and source game.

## Engine-Assisted Review

- Keep analysis user-triggered and position-scoped.
- Add clearer stored-analysis comparison when a move has both human notes and engine data.
- Avoid automatic whole-game analysis until the local memory loop is stable.

## Completed Foundations

- Persisted coach lens comparison preferences.
- Review-session mode with sizing, missed-only repeat, summaries, and history detail.
- Opening weakness map using early-game cards where `ply <= 20`.
- Opening weakness filters, reset control, filtered review sessions, and persisted filter preferences.

## Optional AI Layer

An AI coach layer should come only after deterministic review logic remains stable. If added, it should be optional, clearly labeled, privacy-conscious, and subordinate to the saved user data rather than replacing it.

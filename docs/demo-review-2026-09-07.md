# Lineforge: demo review and replay repair

Date: 2026-09-07. Baseline: c68673c. Local development browser, built-in seven-ply demo; all review attempts are synthetic.

## Completed

- Previewed and imported the demo PGN, scrubbed the preview, and saved the game.
- Annotated ply 6 (Nf6), marked blunder, added missed tactic and king safety tags, and created one card.
- Revealed and marked the card missed; completed a one-card review session and inspected the resulting history, schedule, and weakness buckets.
- Inspected the move-packet preview and backup controls. Downloads and backup restoration were not tested.
- Reopened the app and confirmed the saved game, original PGN metadata, and annotation persisted.
- Captured Play, Study, Review, Weaknesses, Data, and completed-session screens. These are development evidence, not polished portfolio images.

## Demonstrated blocker fixed

Replay previously reconstructed a game from move notation on the standard starting board. It dropped original PGN headers and comments; undo then serialized that reconstruction. Custom starting positions were also not respected.

Replay now loads the canonical PGN and undoes to the selected ply. Newly created records derive their initial position from the actual game history. Regression tests import the production game module and cover metadata at each ply, comments, undo/reserialization, custom starting positions, and navigation bounds.

Validation: the new regression failed against the original implementation and passes with the repair. Existing smoke checks, the new regression, lint, production build (including TypeScript), and diff whitespace validation passed. No browser console errors were observed in the checked view.

## Next product priority

The current review target is the original played move, including a move labeled blunder. The demo asks for Nf6. This verifies recall of the game, not selection of an improved decision. The session also displays Nf6 while asking the user to find it.

Build a bounded correction-card flow: retain the original move as context; let the player save an explicitly sourced alternative with a short reason; hide the answer during review; score against that correction. A legal alternative alone must not be labeled objectively best. Engine-derived targets should retain their analysis provenance. Existing cards should remain identifiable as game-recall cards until a correction is supplied.

Acceptance case: one real game, one documented correction, one hidden-answer review, and a useful explanation after an incorrect attempt. Then test whether a player finds this useful before expanding dashboards or coaching features.

## Limits

This cycle verifies a local software flow and a specific repair. It does not demonstrate learning gains, repeated real-player use, product readiness, engine operation, export round trips, or deployment. Changes remain local and uncommitted.

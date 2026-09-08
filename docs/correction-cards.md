# Correction cards

Implemented locally on 2026-09-07.

## Use

1. Import or load a game, select the original move, and open Study.
2. Under Create correction card, enter an alternative in chess notation, a reason, and a source (your own analysis, a coach, or an analysis reference).
3. Save the correction card. Open Review and select the card labeled Correction.
4. Play a move on the review board or enter notation and choose Check move. Use text entry for explicit underpromotion; board dragging still promotes to queen.
5. After an attempt or reveal, read the saved target, reason, and source. In a session, choose Record result and continue to save a played result and advance. Manual self-grading is available after reveal.

The alternative must be legal from the position before the original move and must differ from that move. A legal move is not necessarily best. Scoring checks one user-saved target; other valid alternatives can be marked as misses. Sources are user-entered references, not independently verified engine evidence. This version does not automatically import engine recommendations.

Existing cards retain their original moves, history, and game-recall behavior. Correction creation makes a separate card with fresh review statistics. There is no conversion or editing of existing targets in this slice.

## Data and review behavior

The optional correction record stores canonical move notation, resulting FEN, reason, source, and save timestamp. The original move and position remain intact. Browser storage and JSON backups retain this record; backup import rejects malformed or inconsistent corrections. Card review packets include the correction in both JSON and Markdown.

Answers, coaching details, and recent attempts stay hidden until an attempt or reveal. Active sessions hide the standalone drill panel and history. Completed-session history is collapsed behind an explicit control. The source-game board is hidden during Review so it cannot expose the original move beside a game-recall question.

## Verification

- Production-code tests cover original-move rejection for a correction, correct alternative acceptance, unchanged legacy scoring, illegal/same/missing target rejection, required reason/source, attempt provenance, backup round trip and malformed data, card packets, session results, and explicit underpromotion.
- The full smoke command includes the correction suite and the prior replay regression. Smoke checks, lint, production build including TypeScript, and diff whitespace validation pass.
- Browser walkthrough: created Qe7 as a correction to the demo's Nf6, submitted Nf6 and saw the correction reason/source, submitted Qe7 in a session and received a match, then completed the legacy Nf6 card in the same session. Reopening retained the correction and attempt history.
- Checked hidden-answer states through the accessibility tree, verified the board and feedback visually, and observed no browser console errors in the final view.

All attempts were synthetic. This establishes local functionality, not chess learning gains or real-player adoption. Backup round trips and packet contents were tested through their production functions; download/file-picker interactions were not exercised in this cycle.

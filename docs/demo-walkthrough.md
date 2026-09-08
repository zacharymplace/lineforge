# LineForge Demo Walkthrough

Use this local walkthrough to create portfolio screenshots from the built-in demo game. It does not require accounts, cloud data, external services, or a personal PGN.

## Setup

1. Install dependencies with `npm install` if needed.
2. Start the app with `npm run dev`.
3. Open the local development URL in a browser.
4. Begin in the Play workflow.

## Manual Walkthrough

1. In Play / PGN import, click **Try demo game**.
2. Inspect the PGN preview metadata, first move snippets, final FEN, and preview board scrubber.
3. Use the preview scrubber controls to move from Start to End.
4. Click **Import game** to create an unsaved draft.
5. In Games, name the draft `LineForge Demo Game`.
6. Click **Save draft**.
7. Use the main board replay controls to select a move worth reviewing.
8. Switch to Study.
9. Add a note such as `I was focused on the attack and did not check the defensive resource.`
10. Set a verdict such as `mistake` or `blunder`.
11. Add tags such as `missed tactic`, `king safety`, or `plan mismatch`.
12. Create a mistake card from the annotated position.
13. If local Stockfish is available, open engine analysis and click **Analyze position**.
14. Attach the analysis to the selected move or card.
15. Review the deterministic summary and selected coach lens.
16. Enable lens comparison and compare up to three coach lenses.
17. Switch to Review.
18. Select the demo card in DrillQueue.
19. Review the card by playing the remembered move, or reveal the move and mark the attempt.
20. Start a short review session from the available cards.
21. Switch to Weaknesses.
22. Inspect the opening weakness map and opening trend surfaces.
23. Return to Study to export a move packet, or Review to export a card packet; inspect the preview modal.
24. Return to Play and save annotation changes before reopening the app.
25. Switch to Data and optionally inspect the local JSON backup/export controls.

## Screenshot Checklist

Capture these moments in order for a coherent portfolio story:

1. **Play: demo PGN preview before import**
   Show the workflow navigation, main board, PGN preview metadata, move snippets, and preview scrubber.

2. **Study: annotated move with saved analysis and coach lens**
   Show the move annotation note, verdict, tags, optional saved engine analysis, deterministic review summary, and coach lens output.

3. **Review: DrillQueue with schedule badge/filter chips**
   Show the selected mistake card, schedule badge, active filters or chips if useful, and the card review controls.

4. **Review: review session**
   Show one card in a focused session, or the completed session summary if a result is more compelling.

5. **Weaknesses: opening map and trend with demo card data**
   Show opening weakness buckets, the opening map filters, trend rows, and recommended focus.

6. **Data: review packet preview or backup tools**
   Show the review packet preview modal with Markdown and JSON details, or the local backup/export panel.

## Notes For Clean Screenshots

- Keep the demo data small. One saved game, one annotated move, and one mistake card are enough to show the loop.
- Use the same demo game name across screenshots.
- Prefer showing deterministic summaries and coach lenses after adding note/verdict/tag data; otherwise the summary will correctly be sparse.
- Engine analysis is optional. If the local engine is unavailable in the capture environment, use the deterministic note/tag/card flow instead.
- Do not add named opening labels manually unless they already exist in the saved data. LineForge does not infer named openings.

## Recorded walkthrough

See [the September 7 review](demo-review-2026-09-07.md) for observed results, the replay repair, screenshot evidence in `screenshots/`, and untested boundaries. Review attempts in that cycle are synthetic. Current cards test recall of the played move, including mistakes; they do not yet validate a corrected decision.

## Correction-card follow-up

The correction-card flow is now implemented locally. See [correction cards](correction-cards.md) for creation, hidden-answer review, provenance, compatibility, and verification limits. Existing cards remain game-recall cards; the earlier walkthrough describes the pre-correction behavior.

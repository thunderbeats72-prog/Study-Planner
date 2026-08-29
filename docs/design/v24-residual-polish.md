# v24 — Residual Polish: Six Genuine Leftovers

Cause → fix notes for the final audit pass. Everything from v14–v23 was
re-verified first and left alone; each fix below lands in the file that
already owns the selector (no new CSS layer, no duplicate components).

| # | Symptom | Root cause | Fix (owner file) |
|---|---------|-----------|------------------|
| 1 | FSRS rating strip (Again / Hard / Good / Easy) collapsed into a one-word-per-line sliver on phones | `.task-row` is a grid at ≤640px with areas `"dot main" "actions actions"`; the strip has no area, so auto-placement put it in the implicit row 3, column 1 — the **10px dot column** | `grid-column: 1 / -1` for `.task-row > .rating-strip` inside the same mobile block (ui-polish.css) |
| 2 | Ambient volume slider looked like an OS control inside the otherwise bespoke Focus Studio | `.vol-range` was styled with `accent-color` only — the app's one remaining native input skin | Rebuilt on the onboarding-slider language: 8px rail / 26px strip, gradient fill from `--vol-fill` (inline, from `vol` state), pressed thumb, focus ring, dark-theme track, 24px touch thumb (globals.css `.ambient-panel .vol-range` + FocusView.tsx) |
| 3 | Hero live chip showed a static `●` text bullet and stayed green while *paused* / *on break* | The chip pre-dates the shared recording language (`recDotPulse`, honest idle states) | Real 6px `.task-live-dot`, pulsing only while recording; `is-idle` muted, `is-break` amber — mirrors the Focus Studio state chip. Rules in ui-polish.css live-state section; markup in Dashboard.tsx; reduced-motion guards extended |
| 4 | Calendar pills unreadable for light subject colours (white on amber/lime/cyan ≈ 2:1) | `cal-pill` painted the raw subject colour under white text | `color-mix(in srgb, C 62%, #191631)` inline — hue survives, contrast passes (PlannerView.tsx). Day-cell tints unchanged (no text) |
| 5 | Quick Add duration chips / date segment felt dead | Only controls in the app with no hover, press, transition, and a second flat selected style | Shared tactile contract (quiet hover gated on fine pointers, spring press, gradient selected state, focus-visible) in practical-enhancements.css |
| 6 | Open Quick Add tray sized itself to its content and sat ragged inside header rows | The tray is a flex child of `.day-head-side` / `.planner-quickadd-row`, so its width was max-content | `:has(.quick-add-panel)` flips the host row to block + `width: 100%` — full-width sheet only while open (`:has` was already a repo baseline) |

## Verification

- Cascade checked in the built bundle: each new declaration confirmed to win
  (`grep` the `.next/static/chunks/*.css` files, last matching rule per
  selector).
- `npm run typecheck` · `npm run lint` (0 warnings) · `npm test` (250/250) ·
  `npm run build:app`.
- `deploy-package/src` re-synced byte-exact from `src/`.

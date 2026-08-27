# v19 — Collapsed rail: one highlight · sidebar-sized ⌘K hint · mobile app bar contract

Two reported bugs in the minimised (rail) sidebar and one in the phone top bar.
All three are fixed in one appended CSS layer (`src/app/globals.css`, section
“v19”) plus a small markup move in `src/app/page.tsx`. No behaviour, data or
routing changed.

## 1. Conflicting active states in the collapsed rail

**Reported:** in the collapsed view the active purple background applied to
*both* the app logo (the stacked-squares mark) and the current tab.

**Cause:** the rail has one genuine highlight — the measured “liquid” pill that
sits behind the active `.nav-item` (`.nav-list::before`, painted with
`--accent-gradient`). The brand tile `.brand-logo-icon` is painted with *the
same* `--accent-gradient` fill (line 82) and carries a spinning conic halo
(`.brand-logo-icon::before`, line 1284). Expanded, that reads as branding: the
wordmark sits next to it. In a 78px icon-only column, a 36px purple rounded tile
directly above a 52×42 purple rounded pill reads as a second selected tab.

**Fix (CSS only, desktop `min-width:861px`):** inside `.app-wrapper.sb-collapsed`
the mark goes quiet — `background:var(--row-bg)`, `color:var(--text-muted)`,
1px `--glass-border` rim, `box-shadow:none`, halo `animation:none;opacity:0`.
A reserved 1px transparent border on `.sidebar .brand-logo-icon` keeps the rim
from nudging the glyph when the state swaps, and the tile transitions on the
rail’s own `--rail-dur`/`--rail-ease` so it fades with the labels rather than
popping. Both are scoped to the sidebar because `.brand-logo-icon` is reused by
the AI panel’s own mark, which must not gain a rim or a rail transition.
The expanded sidebar keeps the gradient tile — there it is branding, not a nav
state. Markup: the tile is presentational, so both brand marks are now
`aria-hidden="true"`; the clipped `.brand-text` keeps the accessible name.

**Result:** in the rail, only the active route is highlighted.

## 2. ⌘K hint cropping / overflowing when the sidebar collapses

**Reported:** “Press ⌘K / Ctrl-K for commands” did not shrink with the rail, so
it cropped mid-word and hung outside the sidebar.

**Cause:** the hint was `position:fixed;bottom:14px;left:14px` *outside*
`.app-wrapper` — a sibling of the sidebar, sized by its own text (~183px). The
rail shrinks to 78px (52px of content); the hint had no idea, so it stayed full
width over the workspace, and at the narrower `--sidebar-w` steps (212–232px) it
overstated the sidebar even when expanded.

**Fix (markup + CSS):** the hint moved *into* `<aside class="sidebar">` as the
last row after `.sidebar-foot` — now the rail’s own width **is** the hint’s
width, and the sidebar’s `overflow:hidden` guarantees nothing escapes.

* `display:flex; width:100%; min-width:0; max-width:100%; overflow:hidden` —
  it can never exceed the box it is in;
* `.cmdk-tip-text` uses `white-space:normal; overflow-wrap:anywhere`, so a
  narrow (212px) sidebar wraps the sentence onto a second line instead of
  chopping it — the same rule the course name above it follows;
* in the rail the sentence rides the established clip-and-fade pattern
  (`max-width 190px → 0`, `opacity`, `translateX(-8px)` on `--rail-dur`), and a
  compact `<kbd class="cmdk-tip-key">` chip takes its place, centred —
  “⌘K”/“⌃K” is ~30px, inside the rail’s 52px content width;
* the chip’s modifier is chosen with `useSyncExternalStore` (`useAppleKeyboard`
  in `page.tsx`): server + first hydration paint answer ⌘, the client corrects
  to ⌃ on non-Apple keyboards, so there is no hydration mismatch and no
  `setState` in an effect (which `react-hooks/set-state-in-effect` forbids).
  The full sentence stays in the DOM, so screen readers still read it and
  `title`-less clipping never hides information from AT.
* `display` for the tip is now owned by this layer, so both places that must not
  show it are restated: `max-width:860px` (the sidebar is the bottom dock — no
  keyboard there) and `display-mode:standalone` (installed windows, as before).
  Zen mode still wins with its `display:none !important`.
* one more quiet case: on a short window (`max-height:700px`) the *expanded*
  sidebar's footer card can be taller than the space left under the nav, and
  `.sidebar{overflow:hidden}` would cut the hint in half — exactly the complaint
  — so `.app-wrapper:not(.sb-collapsed) .cmdk-tip` hides it there. The collapsed
  rail (~98px of chrome + 30px for the chip) always fits and keeps its chip.

## 3. Mobile top bar — explicit flex contract

The bar’s layout was inherited from whichever of four older
`@media(max-width:860px)` blocks happened to win (base 511 → 1235 → 2918 → 3123 →
3522 → 3752 → 4796 → v17 5837), which is how padding kept flip-flopping between
10/12/14px, `display:flex` came from a rule that also hides the bar on landscape
phones, and the streak chip had nothing bounding it against the title.

The v19 layer states the whole contract in one block, so nothing has to be
inferred from the cascade:

| Requirement | Rule |
| --- | --- |
| Row, split and vertically centred | `.mobile-header{display:flex;align-items:center;justify-content:space-between;gap:12px;box-sizing:border-box}` |
| Logo + title grouped with consistent spacing | `.mh-brand{display:flex;align-items:center;gap:12px;flex:1 1 auto;min-width:0}`, `.mh-titles{flex-direction:column;gap:1px;min-width:0}` |
| No stretching or squashing | `.mobile-header .brand-logo-icon{width/height:26px;max-width/max-height:26px;flex:0 0 26px}` (beats `.brand-logo-sm`’s 30px on specificity), `.mobile-header .mh-streak{flex:0 0 auto;min-height:26px;max-width:44vw;white-space:nowrap;line-height:1}` |
| Edge padding | `padding:env(safe-area-inset-top) max(16px,env(safe-area-inset-right)) 0 max(16px,env(safe-area-inset-left))` — 16px normal, wider next to a notch |
| Height / overflow safety | `height:var(--header-h)` (46px + inset), title column `min-width:0` + ellipsis from v17, so long section names truncate instead of pushing the chip out |

Because this layer now owns `display`, the landscape-phone exception is restated
after it — `@media(max-width:900px) and (max-height:500px) and
(orientation:landscape){.mobile-header{display:none}}` — so a shorter landscape
phone can never get a resurrected bar. The 26px tile also loses its spinning halo
inside the 46px bar.

## Guards

`prefers-reduced-motion:reduce` kills the transitions on everything this layer
animates; `forced-colors:active` re-covers the mark, the key chip and the streak
rim with `Canvas`/`CanvasText`; `prefers-contrast:more` raises the rim.

## Verification

`npm run typecheck`, `npm run lint` (`--max-warnings=0`), `npm test` (131/131)
and `npm run build:app` all pass; the production CSS was checked rule-by-rule to
confirm the v19 declarations win their cascade fights (`.mobile-header`,
`.cmdk-tip`, `.app-wrapper.sb-collapsed .brand-logo-icon`) and that the
landscape/mobile/standalone `display:none` rules still beat the new
`display:flex`/`display:flex` declarations.

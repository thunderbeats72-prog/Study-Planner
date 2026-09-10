# v25 — Responsive UI System: one stylesheet pair, one type scale, no override war

Design note for the whole-app visual/responsive pass (Planner, Overview, Focus,
Analytics, Zen, Onboarding, Settings, Subjects, app shell). Cause → fix, the
token contract, and what the suite now refuses to let regress.

## The problem

The app had been redesigned eleven times without deleting a pass. Eleven
stylesheets were imported in sequence, each restating the components the
previous one styled, so the answer to "how big is an H1?" was "whichever file
was written last". The visible symptoms were the ones reported by users:

| Symptom | Actual cause |
|---|---|
| Headings "wrong everywhere", sizes jumping per page | 13 competing `.page-title` font-size rules (4 with `!important`), 6 for `.section-title` |
| Text looked soft / out of focus | `backdrop-filter: blur()` on **in-flow** cards (74 declarations), `translateY(.5px)` hover lifts, stacked opacity layers |
| Mobile task cards clipped titles, no lesson text, tall empty boxes | fixed `min-height`, `white-space:nowrap` + ellipsis, and the brief living in a popover |
| Desktop calendar unusable on phones | one grid designed for ≥1024px, horizontally scrolled below that |
| Two buttons doing one job in three places | `[Start]`/`[Pause]`/`[Done]` split between a clock chip, a ⋮ popover and a row of six buttons |
| Zen looked broken in light themes | the room was painted with hardcoded `#hex` values, and the theme bridge re-tinted it with `filter` |
| A component disagreeing with itself | kind colour declared separately for the rail, the chip and the dot |
| "One more polish file" instinct | no owner list; nobody could say which file had the final word |

## The principle

**One owner per question.** A token answers *what* (spacing, type, colour of a
kind); the sheet imported last — now exactly one file, `ui-system.css` — answers
*how it looks*. Anything that can be expressed with the cascade
(document order + `@container`) is expressed with it, so `!important` is only
ever a repair for an inline style, never a tie-break between two stylesheets.

## Changes

### 1. Sheets: 11 → 2

`src/app/globals.css` keeps tokens, base typography, theme sets and the shell.
Everything the ten patch sheets said was concatenated — **in their original
import order**, so the cascade result is bit-for-bit the merge of the same
declarations — into `src/app/ui-system.css`, which is numbered into sections
(`§25.x` is this pass). `layout.tsx` imports exactly the two.

Then the dead weight went out:

| Pass | Removed | Why it was safe |
|---|---|---|
| Prune 1 | 625 rules (~60 KB) | every class in every selector of the rule is absent from all of `src/**` and from the test suite |
| Prune 2 | 113 rules (~22 KB) | same test, re-run on **comment-stripped** source so a prose mention of `.task-row` could not resurrect a rule |
| Cleanup | 18 empty `@media`/`@supports` shells | their only rule had just been deleted |

Net: 4,330 rules → 3,889; 543,937 bytes → 518,395 (while *adding* ~57 KB of new
single-owner rules for §25). `!important`: 1,107 → 803.

### 2. Type: one fluid ramp, headings included

`--fs-micro … --fs-h1`, plus the two steps this pass added (`--fs-h2`,
`--fs-h3`) and `--fs-kpi` / `--fs-timer`, are `clamp()` ranges in `:root`.
Every heading reads from them:

```
.page-title  { font-size: var(--fs-h1); line-height: 1.08;
               letter-spacing: -.022em; word-spacing: .012em; text-wrap: balance; }
.card-title  { font-size: var(--fs-h3); font-weight: 800; letter-spacing: -.014em; }
.section-title { font-size: var(--fs-h3); font-weight: 780; }
```

Consequences that matter: there is **no** `.page-title` size in any `@media`
block any more (the ramp already shrinks at 320px); tracking is an optical
correction on a display face at display sizes, not a blanket negative squeeze;
`text-wrap:balance` handles the ragged two-line title that the old `font-size`
patches were trying to fix. The reading modes keep their feature but express it
against the ramp (`body.mode-young .page-title { font-size: calc(var(--fs-h1) * 1.06) }`).

Numerals: one token, `--font-num`, with tabular figures. The old
`JetBrains Mono` reference in the ticker and the `--font-ibm-plex-mono` alias
chain are gone, so a heading can no longer be "helped" into a different family.

### 3. Space: four tokens, not per-card numbers

`--gap-page` (page stacks) · `--pad-card` (card padding) · `--pad-tight`
(head/section internals) · `--gap-cluster` (control groups). `.page-stack`,
`.section-card`, `.card-head`, `.plan-list`, `.planner-day-list` all consume
them; sibling margins were deleted because a gap owner is one place, a margin
owner is N.

### 4. The calendar: designed for both shapes, sized by its container

One component (`.planner-cal`) renders a real month — 5 rows × 7 cells for the
whole month, leading/trailing blanks as inert `.cal-cell.is-empty` — and
changes *shape* by container width, not viewport:

```css
.section-card { container: card / inline-size; }         /* the query hook */
@container card (min-width: 660px) { … show .cal-chips … } /* wide: 3 titles + "+N" */
@container card (max-width: 560px) { … dots only … }      /* narrow: 7×~34px cells */
```

Below 640px the planner swaps to a month **list** (`.planner-day` cards: day
badge, title, meta line, tasks) and a tap opens `.day-sheet` with that day's
work and the legend. Weekday heads abbreviate to one letter under 480px, and
the selected day carries a ring while *today* carries a tint — two facts, two
signals.

### 5. Task cards: content-sized, brief visible, one action row

| Before | After |
|---|---|
| `.task-row { min-height: 72px }` + `nowrap` titles | `.task-card` grid `3px minmax(0,1fr)`; title wraps (`text-wrap: pretty`), no min-height |
| lesson text inside the ⋮ popover | `.task-card-brief` visible: 2 lines, `Show more` toggles the full brief + concept list |
| `[Start][Pause][Done][Edit][Skip][⋮]` in one 330px-wide row | `[Clock in][Done]` in `.task-btns role="group" aria-label="Task actions"`; ⋮ holds Edit / Skip / restore only |
| kind colour written 3× | `--task-lesson / --task-recall / --task-review / --task-checkpoint` drive rail, chip and dot from `KIND_META` |
| `var(--ink, #0f172a)` fallbacks everywhere | zero `#hex` fallbacks in components — the theme owns the token, a light fallback *is* a dark-theme bug |

### 6. Focus + Zen

Focus keeps the real clock (seconds-accurate, fractional-minute logging) and
adds a working Fullscreen toggle, with the state controls shrunk from hero
buttons to a medium segmented row. Zen is now theme-aware through a `--zen-*`
set derived from each theme's `--illustration-*` bridge:

```
--zen-bg / --zen-ink / --zen-surface / --zen-surface-hi / --zen-line
--zen-ring-track / --zen-paper / --zen-shelf / --zen-plant / --zen-motes / --zen-muted
```

so light themes get a lit-paper room with dark ink and dark themes the night
version — no `filter`, no `#hex` in the SVG. The daily quote rotates by date
and is attributed (James Clear ×2, Steve Jobs, Proverb, Roy T. Bennett, Ellen
Langer).

### 7. De-blur, done as a material rule

`backdrop-filter` survived only on layers that float *above* content:
`.mobile-bottom-nav`, `.mobile-header`, `.tracker-bar`, `.sidebar`,
`.modal-overlay`, `.modal-box`, `.cmdk`, `.toast`, `.ai-panel`, the scrims and
`.day-sheet`. Removed from every in-flow surface (`.section-card`, `.task-card`,
`.kpi-card`, `.day-block`, chips, badges, buttons). Alongside it: 29 hover
transforms that were `translateY(-.5px)`/`translateY(-1.5px)` (which rasterises
type twice) now use `translate3d(0, var(--reveal-y), 0)` with whole-pixel
values, and the stacked `opacity` layers on reveal wrappers were flattened.

### 8. Shell

Mobile: five-slot bottom nav (`display:none` by default → `grid` under the
phone breakpoint), safe-area padding, `env()`-aware heights, and the top bar
title flexes with an ellipsis instead of pushing the actions off-screen.
Desktop: the sidebar rail collapses to icons, the ⌘K hint lives inside the
rail, and `min-width:1024px` is where the layout stops being the mobile one.

## Verification

- `npm run check` — typecheck + `eslint --max-warnings=0` + suite: **242 passed, 0 failed**.
- `npm run build:app` — all 18 routes, both sheets compile.
- New v25 guards in `scripts/test-suite.ts`: single `.page-title` size owner,
  card/section titles on the ramp, spacing tokens present, no `var(--x,#hex)`
  fallback in components, `--font-num` only, `--zen-*` + `--illustration-*`
  bridge, all four `--task-*` kinds defined and read by the component, calendar
  container contract, blank cells inert, bottom nav off-by-default/grid-on-phone,
  **no in-flow text surface frosted**, no half-pixel transforms, and an
  `!important` ceiling that only ever tightens.
- Render smoke with `react-test-renderer` (temp script, since deleted):
  PlannerView (list + calendar tab), TaskCard, Dashboard, FocusView,
  AnalyticsView render clean; the calendar tab produced 1 grid · 5 rows ·
  35 cells · 32 chips for September, and clicking a busy cell on a desktop
  width correctly scrolled the list instead of opening the sheet.

## Deliberately left alone

- The remaining `#hex` literals are **data**, not styling: `THEME_SWATCH` in
  Settings, the subject `PALETTE` in Onboarding, subject colours in
  SubjectsView, one white highlight stroke in `Illustrations.tsx`.
- `.task-more-wrap` still has earlier definitions: they exist to beat
  `.task-more-wrap > .btn { width: auto !important }`, which is itself a repair
  for Tailwind `!`-utilities in markup. Deleting the pair would re-break the ⋮
  button; §25.5 documents the final word instead.
- `ui-system.css` is not Prettier-formatted: reformatting a 4,959-line
  hand-merged cascade would bury the real diff. The repo's `check` script does
  not run `format:check`; run `npm run format` if you want the cosmetic pass.

## If a v26 continues this

1. The 77 selectors still defined more than once in `ui-system.css` are the
   next honest target — dedupe with the declaration-merge rule used in §25.12
   (later wins for a shared property, earlier-only properties merge forward).
2. `--illus-*` in Illustrations and `--ill-*` are one bridge; fold the alias
   layer when the SVGs are next touched.
3. Breakpoint cleanup: 355/431/460/479/680/760/1080/1100/1120/1180/1500px
   queries are one-off re-tunes; most can die once §25's owners are stable.

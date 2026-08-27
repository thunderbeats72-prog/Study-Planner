# v17 — True list view · Smooth sidebar rail · Rebuilt mobile chrome

Three reported problems, one appended CSS layer (`globals.css`, section “v17”)
plus two small markup changes in `src/app/page.tsx`.

## 1. Planner “List” was not a list

`v11` optimised the planner for wide screens by turning `.planner-days` into a
grid: `repeat(2, …)` from 1120px and `repeat(3, …)` from 1600px. On any normal
laptop that meant the **List** tab rendered day cards **side by side** — the
exact complaint. `v16` restyled the rows *inside* each day, so the rows looked
like a list while the days themselves stayed in columns.

v17 makes the container a vertical flex column at every width and explicitly
neutralises both historical breakpoints (`grid-template-columns:none`), so the
List tab is now literally one day per row, full width, top to bottom. Calendar
and Kanban are untouched — side-by-side is correct there.

On very wide screens the rows gain fluid horizontal padding
(`clamp(--sp-3, 2.2vw, 34px)`) so a full-width row still has a comfortable
optical margin instead of edge-to-edge text.

## 2. Sidebar collapse/expand animation

Before, only `width` and `padding` were animated. Everything else was switched
instantly with `display:none` — nav labels, the brand text block and the footer
card — and the toggle button jumped from `position:absolute` (header corner) to
`position:static` (centred). Result: content vanished a frame before the rail
started moving, the icons re-centred with a snap, and the button teleported.

v17 choreographs the whole rail on one timing pair
(`--rail-dur:.4s`, `--rail-ease:cubic-bezier(.32,.72,0,1)` — a decelerating
“iOS rail” curve):

| Part | Collapse | Expand |
| --- | --- | --- |
| Nav labels / brand text | `max-width 190px → 0`, opacity out in 130 ms, slide −10px | reverse, opacity delayed 120 ms so text appears only once there is room |
| Nav items | `gap 11px → 0`, side padding → 0, icons re-centre over the same 400 ms | reverse |
| Footer card | folds (`max-height → 0`) + fades + drops 12px | unfolds |
| Toggle | glides `right: 0 → calc(50% − 20px)` (stays absolutely positioned, so it never teleports); chevron rotates on the same curve | reverse |
| Brand header | `padding-top → 46px` clears the now-centred toggle | reverse |

The measured liquid nav pill (`--nav-x/y/w/h`, set from `page.tsx`) is
re-measured every frame of the transition by its `ResizeObserver`. Its own
transition (0.46 s spring) used to overshoot that stream of updates, so while
the rail is moving the wrapper carries a temporary `sb-anim` class (set for
520 ms by `toggleSidebar`) that shortens the pill transition to 180 ms — the
pill now *tracks* the rail.

`prefers-reduced-motion: reduce` disables all of it (state change, no travel).

## 3. Mobile interface

**Top bar.** It was a logo, a wordmark that collided with the streak chip, no
sense of place and a hard drop shadow. It is now a real app bar:

- 30px gradient icon tile,
- the **current section** in display type (`Overview`, `Planner`, `Focus`, …)
  with the product name as a quiet uppercase eyebrow above it — so the phone UI
  finally says where you are (the eyebrow is dropped below 380px),
- one right-aligned streak chip with tabular numerals and a tinted rim,
- frosted translucent surface + hairline instead of the heavy shadow; the
  existing scroll-aware chrome (`lgFrost`) still deepens it as content passes
  under, and reduced-transparency / forced-colors fall back to a solid bar.

**Study-clock strip.** The sticky pill used to wrap into a lopsided blob on
phones. It is now an explicit two-row card: status dot + label + elapsed time
on row one (time right-aligned, tabular), a full-width wrapping action row
underneath where buttons flex to equal widths.

**Page header & planner tools.** Single column, tighter display type, and the
view tabs / subject filter / rebalance button each take the full width instead
of fighting for one line.

**Day cards.** Head and progress bar share one baseline, tighter paddings, and
the workspace reserves `--dock-h + 30px` so the last row always clears the
floating dock capsule.

## Preview data (sandbox only)

`src/lib/demoState.ts` supplies a deterministic sample plan (4 subjects, 20
lessons, 28 tasks across 9 days, 12 sessions). It is only reachable from the
fallback branch of `fullState()` **and** only when `SPP_DEMO_DATA=1`. With a
real `DATABASE_URL`, or without the flag, it is dead code — it exists so the UI
can be reviewed in a preview environment that has no PostgreSQL attached.

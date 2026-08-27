# v14 — “Liquid Glass Deluxe” design document

**Scope:** a visual-only layer — material (liquid glass / translucent gradients),
depth, alignment, padding rhythm, motion and responsiveness.
**Non-goals:** no feature, data, copy or behaviour changes. Every interaction
keeps working exactly as before; only *how it looks and feels* is upgraded.

Applicable to: `src/app/globals.css` (new `v14` layer, appended last so it wins
the cascade), plus class-name hygiene in `src/app/page.tsx`,
`Dashboard.tsx`, `FocusView.tsx`, `SubjectsView.tsx`, `SettingsView.tsx`,
`PlannerView.tsx`, `Heatmap.tsx`.

> **Status: implemented.** Sections 1–10 are the design as approved; **§11
> reconciles it with the code as shipped** — renamed selectors, options
> rejected during implementation and the two cascade fixes that turned out to
> be necessary. The layer itself is the `v14 LIQUID GLASS DELUXE` block at the
> end of `src/app/globals.css`; the user-facing summary is the matching block
> in `README.txt`.

---

## 1. Baseline audit (what already exists, and what it costs)

The design system arrived here through eleven accumulated layers (`v10`
restyle → `v11` “anti-clunky” polish → `LIQUID GLASS LAYER` → universal
device compatibility → signature delight → deep glassmorphism → v12 ambient
canvas → v13 deluxe polish). What is genuinely in place:

| System | State before v14 |
|---|---|
| Tokens | 7 themes, `--accent-gradient`, `--radius-*`, `--shadow-*`, `--spring*`, `--sp-1..5`, `--fs-*`, `--pad-shell`, `--gap-grid`, `--tap`, `--header-h`, `--dock-h` |
| Motion | 20+ keyframes, entrance staggers, press physics (`--press-sm/md/lg`), reduced-motion kill switch |
| Glass | Deep-glassmorphism tint + edge hairlines + `--glass-depth` shadow ladder, `prefers-reduced-transparency` honoured |
| Ambient | v12 canvas: dual accent glow + fixed grid mesh; v13 aurora drift |
| Responsive | 12 viewport bands, device calibration (S24 / V15 / 2dppx / 4K), safe areas, touch-target 44px floor, hover-vs-touch separation |
| Interaction | ripple on click, cursor spotlight on `.tilt-card`, KPI count-up, FAB float/glow, heading shimmer |

Six real gaps remained — the targets of this document:

1. **Glass is tinted but not refractive.** Nothing bends light at an edge, so a
   floating layer reads as a semi-opaque card rather than glass. Blur exists only
   as a uniform background filter.
2. **No pointer response on most surfaces.** The spotlight existed on
   `.tilt-card` only, and no surface carries a specular highlight that follows
   the cursor — the one cue that reads as “liquid”.
3. **Nothing is scroll-aware.** The sticky tracker bar, mobile header and dock
   look identical at scroll 0 and scroll 2000. `animation-timeline` was used 0
   times in the whole file.
4. **Layouts respond to the viewport, not to their own column.** `@container`
   was used 0 times. Collapsing the desktop sidebar adds ~190px of workspace
   and *nothing reflows* — the KPI row stays 4-across and each card goes
   cramped; the reverse happens on a 900px-wide phone in landscape.
5. **Entrances are keyframe-only.** `@starting-style` and `interpolate-size`
   were unused, so expanding panels (lesson brief, intelligence details) snap
   open, and newly-mounted floating layers can’t transition.
6. **Padding and headings are hand-tuned per component.** `style={{ padding:
   16 | 18 | 20 | 22 | 24 | 28 }}` and `h3` at `.88 | .92 | .95 | 1 | 1.2rem`
   are scattered across five views — seven “sizes” of the same two things.
   Accent edges were inline `borderLeft: 3px/4px solid …` in four places.
   The heatmap month labels are `calc(n * (13px + 3px))` while phone rules
   shrink cells to 11px and 9px → labels drift off their columns.

---

## 2. Design principles for this layer

1. **Glass = depth, not decoration.** Refraction and specular light are
   allowed only on surfaces that genuinely float (≤4 at a time). Static cards
   keep a tint, a rim and a shadow — never a blur.
2. **Legibility is a hard floor.** No surface’s tint drops below ~84% opacity,
   and nothing may reduce text contrast below the existing per-theme values.
3. **One motion vocabulary.** Every new timing is expressed with the existing
   `--dur-*` + `--spring*` tokens; no new easing curves are invented.
4. **Container-first responsiveness.** If a size change is caused by the
   *column*, it must be a container query. Viewport queries stay reserved for
   chrome (dock, header, safe areas).
5. **Progressive enhancement, never a fork.** Every modern-CSS trick is wrapped
   in `@supports`; where unsupported, the v13 look is what the user sees. No
   “new browser only” layout.
6. **Battery is a feature.** Each added `backdrop-filter` or infinite animation
   must be justified; ambient loops pause on `prefers-reduced-motion`,
   `body.mode-focused`, and when the tab is hidden.

---

## 3. Material spec — four tiers

New tokens (all `color-mix()`-derived, so all 7 themes inherit automatically):

```
--lg-gloss        top-edge light overlay (light themes .55 white / dark .05)
--lg-rim-strong   1px inner top highlight
--lg-refract      blur used ONLY inside the refractive rim
--lg-spec         cursor-tracked specular gradient
--lg-beam         conic rim-light gradient (registered --lg-angle)
--glass-blur-card  none (tier 1)  |  --glass-blur-float blur(26px) saturate(180%)
```

| Tier | Surfaces | Background | Blur | Rim | Extras |
|---|---|---|---|---|---|
| **0 — canvas** | `body`, `.loader-screen`, `.ob-overlay` | v12 glow wash + grid mesh + v13 aurora | — | — | mesh gains a slow scroll parallax (scroll timeline) |
| **1 — card** | `.glass-panel`, `.kpi-card`, `.dash-card`, `.section-card`, `.day-block`, `.up-next`, `.intel-card`, `.momentum-pill` | `linear-gradient(168deg, tint 88% → 92%)` + a per-kind accent/ai wash in one corner | none | top `--lg-gloss` + bottom hairline | cursor specular pool, hover rim-brighten, 1px gradient accent edge |
| **2 — floating** | `.tracker-bar`, `.sidebar` (dock), `.ai-panel`, `.modal-box`, `.cmdk`, `.toast` | translucent gradient tint, ≥84% | `--glass-blur-float` (14px on touch) | full ring highlight | **refractive edge** (blurred backdrop masked to the rim), scroll-reactive frost |
| **3 — overlay** | `.modal-overlay`, `.cmdk-overlay`, `.zen`, `.ob-scrim` | `rgba` + `backdrop-filter: blur(18px) saturate(120%)` + radial vignette | yes | — | `@starting-style` fade, no rim |

### 3.1 Refractive rim (the actual “liquid glass” cue)

```css
.lg-refract::before{           /* tracker bar, dock, chat sheet, modal, cmdk */
  backdrop-filter:var(--lg-refract);       /* blur + heavy saturation          */
  mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  mask-composite: exclude;                 /* keep only the 10px rim ring      */
}
```

The rim samples and refracts whatever scrolls past the edge of the panel, which
is exactly what makes iOS/visionOS glass read as glass. Guarded by
`@supports (backdrop-filter:blur(2px)) and (mask-composite:exclude)`; the ring
is `pointer-events:none` and clipped to the border-radius.

### 3.2 Cursor specular pool

`.glass-panel::before` (that pseudo-element is unused today) carries
`radial-gradient(340px circle at var(--lx) var(--ly), …accent 12%…)`,
`opacity:0 → 1` on hover, `.5s ease`. `page.tsx` already runs a rAF-throttled
delegated `pointermove` for `.tilt-card`; v14 extends the same single handler to
`.glass-panel` and writes `--lx/--ly` on the hovered element only. Zero cost on
touch (handler bails on `pointerType !== "mouse"`), zero cost when the pointer
is not over a card.

### 3.3 Translucent gradient language

* Card corner wash: `.kpi-card` accent 9% → transparent; `.intel-card` AI
  violet 9%; `.up-next` accent→AI diagonal; `.day-block` neutral + accent only
  when the day contains a live session.
* Gradient hairlines replace flat borders in five places: `.divider`,
  `.section-title::after`, `.day-head::after`, `.ob-btn-row` top rule,
  `.intel-details` top rule — `linear-gradient(90deg,transparent,accent,ai,transparent)`.
* **Live rim beam:** `@property --lg-angle` + `conic-gradient(from var(--lg-angle),
  …)` on the *one* element that deserves it: the `Up next` card while a session is
  recording, and the loader ring. `.day-block:has(.task-row.active-clock)`
  inherits the same treatment, so the card that owns the running timer is the
  only card in the list that glows — no JS.
* Progress: `.bar-fill` gains a 2-stop gradient cap and an inner gloss line;
  heatmap levels become `color-mix` gradients rather than flat steps.

---

## 4. Alignment & padding (fixing the audit’s item 6)

**One card, one padding.** New semantic classes; the inline `style` props go
away and the classes carry the values:

| New class | Replaces | Definition |
|---|---|---|
| `.section-card` | `glass-panel` + `style={{padding:20\|22\|24\|28, marginBottom:16\|18}}` | `padding:var(--sp-4)` · `margin-bottom:var(--sp-3)` |
| `.section-head` | `.day-head style={{marginBottom:10\|12}}` | flex, `align-items:center`, `gap:12px`, `margin-bottom:var(--sp-2)` |
| `.section-title` | `h3 style={{fontSize:.88\|.92\|.95rem\|1rem,fontWeight:800}}` | `font-size:var(--fs-md)` · `750` · `-0.02em` · gradient underline |
| `.section-meta` | `span.day-meta` wrappers | reuses `--fs-chip`, right-aligned, `white-space:nowrap` where it fits |
| `.accent-edge` (+ `--accent \| --success \| --warning \| --danger \| --ai`) | inline `borderLeft:3px/4px solid …` | 1px gradient hairline on the inline-start edge + matching corner wash |
| `.panel-lead` | `p style={{fontSize:.76rem,color:--text-dim,…}}` | `--fs-xs`, `text-wrap:pretty`, `max-width:64ch` |
| `.stat-big` | `div.mono style={{fontSize:1.9rem,…}}` | `--fs-kpi`, tabular-nums, right-aligned |
| `.wk-chart/.wk-col/.wk-bar/.wk-val/.wk-label` | 8 inline styles in the weekly chart | grid with `align-items:end`, bar height via `--h`, labels on a shared baseline |
| `.mastery-list/.mastery-row/.mastery-name` | inline `marginBottom:12`, flex rows | `row-gap:var(--sp-2)`, name/value baseline-aligned |
| `.daybar` | `div style={{width:"min(120px,30vw)"}}` | `width:var(--daybar-w)` (fluid clamp), `flex:0 0 auto` |
| `.timer-center` | inline `position:absolute;inset:0;…` in the ring | absolute centring, no magic numbers |
| `.heat-month` | inline `calc(n*(13px+3px))` | `width:calc(var(--span)*(var(--heat-cell)+var(--heat-gap)))` — labels and cells can no longer desynchronise |
| `.sidebar-foot` | `style={{marginTop:"auto",paddingTop:16}}` | `margin-top:auto; padding-top:var(--sp-4)` |

**Optical alignment rules applied:**

* KPI cards become flex columns with a fixed label row so a card *with* a
  progress bar and a card *without* one still align their big numbers.
* `.task-row` gets `row-gap:var(--sp-1)` everywhere (not only inside modals) and
  `.task-primary{margin-inline-start:auto}` so the Done CTA is always the
  right-most, no matter how many actions precede it.
* `.btn svg`, `.chip svg`, `.momentum-pill svg`: `flex:0 0 auto` +
  `height:1em` so glyphs stop drifting 1px off the cap-height.
* `.vtabs` becomes `width:fit-content` on desktop, `stretch` below 640px
  (already) and never exceeds its container: `max-width:100%`.
* Focus-visible: `.nav-item`, `.cal-cell`, `.task-main[role=button]`,
  `.vtab` share one 2px accent ring with 2px offset (previously only three of
  them had one).

---

## 5. Motion spec

| Trigger | Old | v14 | Tokens |
|---|---|---|---|
| Card/panel entrance | `pageIn .55s` time-based | same, **plus** scroll reveal for below-fold blocks | `--dur-complex`, `--spring-soft` |
| Nav switch (rail + dock) | per-item background swap | **shared liquid indicator** slides/morphs between items; the item itself stops repainting | `--dur-normal` on `transform`, `--dur-complex` on size |
| Page switch | instant | directional enter (`--nav-dir` from the rail order): ±10px + fade | `--dur-complex` |
| Scroll under sticky chrome | static | tracker bar + header + dock frost deepens over the first 60px; header hairline scales in | scroll timeline |
| Expand/collapse (lesson brief, intelligence details) | snap | `interpolate-size:allow-keywords` → height animates | `--dur-complex` |
| Overlay open | keyframe | keyframe **and** `@starting-style` so scrim + sheet transition | `--dur-normal` |
| Pointer over glass | `.tilt-card` only | specular pool on every tier-1 surface; FAB halo follows the cursor | `.5s ease` |
| Live session | green hairline on top of app | + rim beam on the owning card/day block, dock pill gains a comet ring | 3.2s loop, paused for `mode-focused` |
| Theme flip | cross-fade (v13) | unchanged, plus tint ramp on tier-1 surfaces | `.35s` |

Loop budget after v14 (idle dashboard): aurora drift (GPU transform), grid mesh
(scroll-linked, no loop), FAB float+glow (composited), live rim beam (only while
recording). Nothing animates inside text; nothing animates at all when
`prefers-reduced-motion: reduce` — the layer ships a matching guard block.

---

## 6. Responsiveness

### 6.1 Container queries — revised during implementation (see §11)

The original idea was one named container on the column everything lives in:

```
.main-workspace { container: workspace / inline-size }   /* ← REJECTED */
```

`container-type: inline-size` implies `contain: layout`, which turns the
container into the **containing block for `position: fixed` descendants** —
and every view renders its modal overlay *inside* `main`
(`TaskEditor`, the Planner day sheet, the Subject editor). Those sheets would
have sized and centred themselves to the workspace box instead of the
viewport. So the reflow is achieved three ways instead:

1. **Intrinsic grids** — `repeat(auto-fit, minmax(min(200px, 100%), 1fr))` on
   the KPI row (and `300px`/`320px`/`230px` on the paired dash grids, the
   subject wrap and the kanban): the columns track the *available* width, so
   collapsing the rail reflows them without a single query.
2. **Leaf-level containers** — `container: card / inline-size` on the cards
   that hold content (never on an ancestor of an overlay), so a panel that is
   squeezed by a wide sibling densifies itself.
3. **One band rule** for the shell state that is not expressible as a query:
   `@media (min-width:861px) and (max-width:1180px)` + `.app-wrapper.sb-collapsed`
   restores the two-column dashboard while the rail is open at that width.

| Container width | Change |
|---|---|
| `< 460px` | KPI 1-up with `--fs-kpi` reduced; `.section-head` stacks; day bar hidden |
| `460–700px` | KPI 2-up; momentum strip scrolls horizontally |
| `700–960px` | KPI 3-up; `.dash-grid-2`, `.focus-grid-2`, `.subs-wrap` stay 1-up |
| `≥ 960px` | KPI 4-up; `.dash-grid-2` 1.4fr/1fr; `.focus-grid-2` 1.3fr/1fr; `.subs-wrap` 1.6fr/1fr |
| `≥ 1280px` | KPI 4-up with a wider gutter; kanban 3-up with denser columns |
| dock `≤ 90px` | (collapsed rail) nav icons enlarge 20→22px, label row hidden |

Because 1 and 3 follow the column, **collapsing the sidebar now reflows the
dashboard instead of stretching cramped cards** — the single most visible
responsive bug in the audit.

### 6.2 Viewport / device matrix

| Band | v14 rule |
|---|---|
| ≤ 360px (SE, old Androids) | `--sp-*` floors tighten one step; chart height 128px; heat cells 8px/2px |
| 361–430px (S24/S25 class) | dock + header + toast + sheet all honour `env(safe-area-inset-left/right)`; KPI numbers never wrap |
| 431–640px (large phones) | weekly chart 168px; `.vtabs` full width |
| 641–860px (tablets portrait, foldables open) | 2-col planner day-blocks, KPI 2-up via container, chat sheet keeps dock clearance |
| Landscape ≤ 500px tall | header hidden (already), dock becomes a 46px slim row, tracker inlines with the header, timer ring 170px |
| 861–1100px (small laptops, tablets landscape) | rail 212px (already), KPI 2-up, shell padding 14px |
| 1101–1366px (13” laptops, iPad Pro) | comfortable 4-up KPI, `--pad-shell` capped so cards never stretch past 340px |
| 1367–1800px (1080p/1440p desktops) | current rhythm + max-width 1560px (already) |
| ≥ 1800px (4K, projectors) | `html{font-size:17px}` (already) + mesh density +3px, cards max-width guard, chat panel width grows with viewport |
| `@media (hover:none)` | no hover-lift (already) + tier-1 specular pool disabled, press states remain the only feedback |
| `@media (pointer:coarse)` | rim ring skipped (nothing to refract against a finger), blur budget halved (already), 44px floor (already) |
| `display-mode:standalone` | extra bottom clearance for the dock, no ⌘K tip, safe-area padding on the toast |
| `prefers-reduced-motion` | all v14 animations, reveals, beam, parallax and indicator motion off |
| `prefers-reduced-transparency` | every tier collapses to `--surface-solid`, blur off, rim off, tint solid |
| `prefers-contrast:more` | gloss + specular + rim opacity to 0, borders to solid `--glass-border-hover`, tint floor raised to 100% |
| `forced-colors:active` | decorative pseudo-layers (`::before/::after`) hidden; real 1px borders kept; focus ring uses `Highlight` |
| print | v13 print rules unchanged; new gloss/rim/beam explicitly `display:none` |

---

## 7. Performance & accessibility budget

* **Blur:** tier 2 only, and only the 4 layers that can be on screen at once
  (tracker bar + dock + chat sheet + one modal/palette). `@media (hover:none)`
  and `(max-width:820px)` keep the existing 14px budget; the refractive rim reuses
  that same `--lg-refract` value rather than adding a second radius.
* **Paint:** `contain:paint` is *not* added to `.day-block` — the lesson brief
  expands inside it and `content-visibility:auto` was evaluated and rejected
  (scroll-anchoring jank + blank flashes in long planner lists). Instead:
  the specular pool and rim ring are `pointer-events:none` composited
  pseudo-layers, and `will-change` is scoped to `.nav-list::before` only while
  the transition runs (no permanent layers).
* **JS:** no new listeners. The nav indicator reuses a single rAF-measure pass
  (ResizeObserver on `.nav-list`) and the pointer pool reuses the existing
  delegated `pointermove`.
* **Contrast:** tint floors (≥84%) keep every text token at or above the values
  the v11 sweep validated; the specular pool maxes at 12% accent and never
  paints over text (it sits at `z-index:0` under the content).
* **Keyboard:** every tappable card (`role="button"`) gets the shared focus ring;
  the nav indicator moves on `:focus-visible` too, so arrow-key users see it.

---

## 8. Cascade-safety rules for the layer itself

1. Appended as one block at the end of `globals.css` under the banner
   `v14 — LIQUID GLASS DELUXE`, so it wins equal-specificity conflicts, exactly
   like v12/v13. Nothing above is deleted or edited.
2. Existing `!important` mobile dock rules are met with same-or-later
   `!important` only where the shared indicator must replace the per-item fill.
3. All new geometry flows from tokens (`--sp-*`, `--fs-*`, `--heat-cell`,
   `--daybar-w`) so `mode-young` / `mode-focused` inherit sane values.
4. Every pseudo-element used is verified free on that selector first
   (`.glass-panel::before`, `.tracker-bar::before`, `.mobile-header::after`,
   `.nav-list::before` were all unused before v14).

---

## 9. Acceptance criteria

* `npm run check` (strict typecheck + `--max-warnings=0` lint + suite) and
  `npm run build:app` pass — the latter also proves Tailwind 4 / LightningCSS
  accept every new at-rule (`@container`, `@property`, `@starting-style`,
  `@supports`, scroll timelines).
* The dev preview is visually identical in *structure* to v13: no new scroll
  bar, no clipped text, no element moved by more than its padding delta.
* Each of the 7 themes × 5 breakpoints (360 / 430 / 860 / 1366 / 2560) keeps
  the tracker bar, dock, chat sheet and modal legible over the ambient canvas.
* Collapsing the sidebar reflows the KPI row (container query proof point).
* With `prefers-reduced-motion: reduce`, no v14 animation runs; with
  `prefers-reduced-transparency: reduce`, no tier uses blur or translucency.
* Grep check: no `style={{ padding:` / `style={{ fontSize: ".8` / inline
  `borderLeft` left in the five converted views.

## 10. Explicitly rejected

* SVG `feDisplacementMap` “real” refraction — repaints the whole panel per frame.
* `view-timeline`-driven parallax on cards — collides with the entrance
  stagger already tuned in v12 §C.
* `content-visibility:auto` on `.day-block` — see §7.
* Glassmorphism on the task rows themselves — 60+ rows × blur is the exact cost
  the v11 “quiet glass” guidance forbids.
* A full `document.startViewTransition` page swap — React 19 + concurrent state
  makes the snapshot timing unreliable; the directional keyframe entrance
  achieves the same read for a fraction of the risk.

---

## 11. As built — names that shipped (delta against the spec above)

Everything in §3–§7 landed; these are the places where the implementation
name differs from the draft, so the file and this document agree.

**Registered custom properties** (`@property`, so they interpolate):
`--spec-x`, `--spec-y`, `--spec-o`, `--frost` (inherits: true), `--lg-angle`.

**Tokens introduced** (all theme-overridable, in `:root` / `[data-theme]`
agnostic form):

| Token | Value / intent |
|---|---|
| `--gloss` | shared top-sheen layer, `rgba(255,255,255,α)` → 0 in dark themes |
| `--wash-accent`, `--wash-ai`, `--wash-success`, `--wash-none` | corner-of-light gradients used as `--panel-wash` |
| `--panel-tint-a`, `--panel-tint-b` | tier-1 translucent body, 90% → 84% (dark 88% → 80%) |
| `--hair-grad` | 1px gradient hairline (transparent → border → transparent) |
| `--lg-refract`, `--rim-w` | rim filter + thickness; `--rim-w` 10px, 7px on touch |
| `--panel-edge`, `--edge`, `--edge-w` | gradient accent edge (background layer), per-instance colour, 3px |
| `--daybar-w`, `--heat-cell`, `--heat-gap`, `--chart-h`, `--dock-h` | intrinsically scaled metrics |

**Not introduced:** `--glass-blur-float` and `--lg-rim-strong`. The tier-2
blur values are written at their point of use (with the shared
`(hover:none),(max-width:820px)` downgrade), and the rim strength is already
encoded in `--lg-refract`; a second alias would have been a second place to
forget.

**Classes that shipped** (§4’s list, verified against the components):
`.section-card`, `.section-head`, `.section-title--row`, `.panel-lead`,
`.stat-big`, `.accent-edge` (+`--success/--warning/--danger/--ai`),
`.kpi-grid`, `.heat-month`, `.daybar`, `.planner-days`, `.planner-list`,
`.cal-panel`, `.cal-dow-row`, `.cal-more`, `.filter-select`, `.planner-tools`,
`.overdue-strip`, `.lesson-brief-actions`, `.kanban-task`, `.side-form`,
`.empty-panel`, `.subject-lessons`, `.lesson-index`, `.color-field`,
`.compact-modal`, `.modal-grid`, `.modal-title`, `.modal-lead`, `.modal-note`,
`.modal-danger-zone`, `.modal-actions-wrap`, `.day-modal`, `.theme-grid`,
`.engine-status`, `.clock-pickers`, `.clock-actions`, `.mode-row`,
`.custom-min-*`, `.timer-panel`, `.timer-kicker`, `.timer-controls`,
`.timer-footnote`, `.vol-label`, `.vol-range`, `.rules-list`, `.btn-lg`,
`.btn-left`, `.sk-*`, `.brand-logo-sm`, `.brand-wordmark`, `.foot-*`,
`.zen-kicker`, `.zen-status`, `.zen-actions`, `.retry-btn`.

**Keyframes:** `lgFrost`, `lgMesh`, `lgReveal`, `lgBeam`, `lgEnterFwd`,
`lgEnterBack` (`lgRise` from the draft was not needed — the chat panel keeps
its v8 entrance).

**Feature gates actually used:** `@supports (mask-composite:exclude)` for the
rim, `@supports (animation-timeline:scroll())` for the frost/parallax,
`@supports (animation-timeline:view())` for the reveal,
`@supports (interpolate-size:allow-keywords)` on `html` for the `height:auto`
lesson brief, `@media (hover:hover) and (pointer:fine)` for anything specular,
`@media (hover:none) and (pointer:coarse)` for the touch budget. Scroll-driven
animations use `animation-duration:auto` (required for progress timelines)
and sit inside `prefers-reduced-motion: no-preference`.

**Two deviations worth remembering:**

1. *`.up-next.live` / active-day beam.* The hover sheen already owns
   `.glass-panel::after`, so the beam selector is written as
   `.glass-panel:not(.ai-panel).up-next.live::after` and re-states
   `width/left/top/bottom/transform/transition` — otherwise the sheen wins on
   specificity inside `:hover` and the ring slides off the card.
2. *`.mastery-panel`.* The sheen rule also sets `overflow:hidden`, which
   clipped the scroll container’s last rows; the panel now re-declares
   `overflow-y:auto` with `overscroll-behavior:contain` and a bottom mask fade.

**Verification run:** `npm run typecheck`, `npm run lint --max-warnings=0`,
`npm test` (101/101) and `npm run build:app` all green; the emitted CSS was
grepped to confirm LightningCSS kept every gated at-rule
(`lg-nav-ready`×14, `mask-composite:exclude`×4, `animation-timeline: scroll`×4 /
`view`×2, `@starting-style`×1, `interpolate-size`×2, `conic-gradient`×7,
`container: card`×1, `forced-colors`, `display-mode:standalone`). No headless
browser is installable in this environment, so the 7-theme × 5-breakpoint
matrix in §6.2 is asserted by construction (every rule is token-driven and
every breakpoint band is a media/container query on existing variables) and
still needs one pass in the live preview.

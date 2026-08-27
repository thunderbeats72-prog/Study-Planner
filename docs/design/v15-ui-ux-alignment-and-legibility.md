# v15 — Alignment, Spacing & Legibility + Liquid-OS deepening (tracker + lists)

**Scope:** a visual-and-layout pass over the three areas the user flagged as
"not looking good": the **sticky tracker bar (top view)**, the **Planner list
rows**, and the **Dashboard task list** — plus the Focus-studio label/ring
inconsistencies that share the same root cause. Two goals, per the user's
decision:

1. **Legibility** — the timer/planner text stops reading as "mashed-together
   fragments" and reads as **normal sentences on the existing surface**.
2. **More "liquid OS"** — deepen the glass, glow and rim-light treatment on the
   tracker bar, task rows and timer ring, *in addition to* (not instead of) the
   legibility fixes.

**Non-goals:** no feature, data, or behaviour changes. Every action (clock in/out,
pause/break, edit, skip, done, re-plan) keeps working exactly as before. **No
copy strings change at all** — the "shouty" tracker chips are fixed in CSS
(§4.1), not by rewording.

---

## 1. Direction — recorded decision

The user was undecided between **"normal"** and **"liquid OS"**; the decision is
now made:

> **Deepen the liquid-OS look AND fix legibility.** The v11–v14 liquid-glass
> material is the app's identity and stays; the complaint is addressed by (a)
> sentence-case, hierarchy and spacing fixes, and (b) *more* glass — a real
> translucent tracker body, live rim-light, refined glow, and glossy task rows.

**Rejected:** a pure "normal / flat" restyle (deleting the glass layer) — it
contradicts the existing material system and risks all 7 themes for a complaint
that is about type and alignment, not the material (§9).

---

## 2. Baseline audit — exactly what is wrong

### 2.1 Tracker bar (the "timer top view") — `src/app/page.tsx` ~933–975, `globals.css`

Rendered as one capsule (`border-radius:999px`) containing **six independent
fragments** with no hierarchy:

```
●  Not clocked in       00:00        3/5 TODAY   85D TO NOV 20, 2026   [Clock In] [Zen]
   Free session
```

Concrete faults (with evidence):

1. **Shouty uppercase chips.** `.chip{…text-transform:uppercase;letter-spacing:.6px}`
   (line ~164) turns the two meta values into `3/5 TODAY` and `85D TO NOV 20,
   2026`. They use accent/status fills, so they *look* like buttons and compete
   with the real buttons next to them. (Mobile already lowers them to sentence
   case at line ~1918 — desktop is the outlier.)
2. **Dead middle gutter.** `.tracker-bar{justify-content:space-between}` (line
   ~444) stretches the bar and pushes the action cluster against the right edge,
   leaving an empty gap in the middle. The bar reads as three disconnected
   islands, not one sentence.
3. **Conflicting time sizing.** `.tracker-time` (a `.mono` span) has its
   font-size set by at least four rules that fight each other:
   `.tracker-bar .mono{clamp(1rem,3.4vw,1.2rem)}` (line ~1171) outranks
   `.tracker-time{1.2rem}` (line ~2196) *and* `.tracker-time{clamp(1.02rem,.92rem+.5vw,1.3rem)}`
   (line ~3311) purely on specificity, not intent.
4. **Glow blurring the digits.** `.tracker-bar .mono{text-shadow:0 0 24px var(--accent-glow)}`
   (line ~462) blurs the one number that should be crispest.
5. **Capsule × two lines.** A `999px` pill holding a two-line task title
   (`-webkit-line-clamp:2`) is geometrically awkward; the radius already relaxes
   to `var(--radius-lg)` on small phones (line ~3704) but not on desktop.
6. **Opaque glass.** The bar body is flat `var(--surface-elevated)` (line ~454);
   the v14 refractive rim (`::before`, line ~4184) therefore has nothing to
   refract — the bar is a flat plate wearing a glass rim, not glass.
7. **Redundant status vocabulary.** "Not clocked in" + "Free session" + "00:00"
   all describe the same idle state in three different voices.

### 2.2 Planner list — `src/components/PlannerView.tsx` `renderTask` (~98–178)

Each row is a **single `flex-wrap:wrap` row** whose children are (in order):
color dot · `.task-main` (title+sub, `flex:1 1 220px`) · status chip · **Edit** ·
**Skip subject** (conditional, widest label) · `TaskClockButton` · **⋯** (mobile
only) · **Done/Undo** · **Skip** — up to **seven controls in one line**.

- `.task-row{flex-wrap:wrap}` (line ~154) + `.task-row > .btn{flex-shrink:0;white-space:nowrap}`
  (line ~156) means mid-width desktops wrap the buttons onto a **ragged second
  line that floats mid-row**, misaligned with the title block — there is no
  actions *gutter*, just orphan buttons.
- "Skip subject" (a whole-subject action) sits next to "Skip" (a single-task
  action) at equal visual weight — two confusingly similar buttons.
- The Dashboard already solved this with a `.task-row-actions` sub-row + hairline
  divider (`globals.css` ~4990); the Planner **cannot**, because its buttons are
  direct children of `.task-row` (noted in the file at ~5023). The two views
  speak different row languages.

### 2.3 Dashboard list — `src/components/Dashboard.tsx` (~457–485)

Already uses the better structure (`.task-row.clean-list` + `.task-row-actions`),
but:

- `.task-row.clean-list .task-dot{position:absolute;left:16px;top:18px}`
  (line ~4987) **without** `position:relative` on `.task-row.clean-list` — the
  dot anchors to the nearest positioned ancestor (the `.glass-panel` card) rather
  than the row, so its vertical position is coincidental and drifts with any
  padding change.
- The Dashboard row and the Planner row render the same concept differently
  (column card vs ragged wrap) — the inconsistency itself reads as "unpolished".
- On mobile, the Dashboard list shows *all* buttons (Edit / Skip subject / clock /
  Done / Skip) with **no ⋯**, while the Planner hides secondary actions behind ⋯;
  they should match.

### 2.4 Focus studio — `src/components/FocusView.tsx`

`#t-label` is `text-transform:uppercase;letter-spacing:2px` (line ~195) — a tiny
tracked-out label under the timer that matches the "shouty" chip language rather
than the normal-sentence language. The ring itself is sound and gains a subtle
conic halo in this pass (liquid-OS deepening, §4.5).

---

## 3. Design principles for this pass

1. **The material stays — and deepens.** v14 tiers, blur budget, and the
   reduced-motion / transparency / contrast guards stay. New glass follows the
   existing `.toast`/`.modal-box` tier-2 recipe so the legibility floor (≥84%
   tint) is never broken.
2. **One hierarchy per row/bar.** Exactly one thing is bold (the action/state),
   one thing is the number (tabular), everything else is a muted caption.
3. **Sentence case everywhere.** Uppercase survives only in genuine eyebrow
   labels (`.lbl`, `.kpi-label`, `.timer-kicker`). Meta values are sentences.
4. **Token-driven.** New geometry uses `--sp-*`, `--fs-*`, `--radius-*`, `--tap`.
5. **Append, don't rewrite.** Ship as a `v15` block at the end of `globals.css`;
   the only edits above it are the **selector migrations** forced by the JSX
   wrapper (§6) — never a global restyle.

---

## 4. Treatment spec

### 4.1 Tracker bar — "one sentence, one number, one action cluster"

**Layout / typography (legibility):**

- `justify-content:space-between` → `flex-start`; the dead gutter is replaced by
  gap-driven flow: identity left, time pushed right by `margin-inline-start:auto`,
  actions flush right. When the bar must wrap, the actions row wraps as a unit,
  right-aligned.
- **Radius:** `999px` → `var(--radius-xl)` (22px) on desktop, `--radius-lg` on
  ≤640px — a floating card-bar that stops fighting the two-line title.
- **Identity sentence:** on ≥641px, `.tracker-labels` becomes a row with a middot
  separator (`.tracker-task::before{content:"· "}`) — "**Not clocked in** ·
  Free session". Mobile keeps the compact stack.
- **Time:** one authoritative `clamp(1.05rem,.9rem+.6vw,1.3rem)`,
  `font-variant-numeric:tabular-nums`, glow softened to `0 0 14px` so the digits
  stay crisp. Colour stays accent → success when live (existing behaviour).
- **Chips become muted captions, not buttons:** sentence case, `--fs-micro`,
  neutral translucent background, `--text-muted` ink, thin border; the "today"
  chip keeps an accent text hint. **Copy unchanged** — `3/5 today` and
  `85d to Nov 20, 2026` now read as captions because the CSS stops uppercasing
  and shouting them.

**Liquid-OS deepening (with §4.5):**

- Body → tier-2 translucent glass (93%→86% `--surface-elevated` + backdrop blur,
  22px desktop / 14px budget on touch or ≤820px), so the existing refractive rim
  finally has something to refract.
- A rotating conic rim-light on the bar while `body.focus-live` (reuses the
  existing `lgBeam` + `--lg-angle`).

**Before → after (idle, desktop):**

```
Before:  ●  Not clocked in       00:00     3/5 TODAY  85D TO NOV 20, 2026  [Clock In] [Zen]
             Free session

After:   ●  Not clocked in · Free session        00:00      3/5 today · 85d to Nov 20, 2026  [Clock In] [Zen]
```

### 4.2 Planner list — a real two-line row

**JSX** (`PlannerView.tsx` `renderTask`): wrap the action controls in a
`<div className="task-row-actions">` so the row is `dot · task-main · status-chip`
on line 1 and `[TaskClockButton] [Edit] [Skip subject] [⋯] [Skip] [Done]` on
line 2 — the same hierarchy the Dashboard already uses:

```
<div className="task-row …">
  <div className="task-dot" />
  <div className="task-main"> title + sub </div>
  <span className="chip chip-…">status</span>
  <div className="task-row-actions"> …all buttons… </div>
</div>
```

**CSS:**

- `.task-row` is **nowrap** on desktop; `.task-row-actions{display:flex;
  align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end;
  margin-inline-start:auto}`. When the actions don't fit, they wrap **as a
  right-aligned block** — no more orphan buttons.
- The status chip stays on line 1 (it is the row's *state*, not an action).
- Mobile keeps today's declutter ("one action row: Done, clock, ⋯") but the
  selectors move from `.task-row > .btn` to `.task-row-actions > .btn` (§6).

### 4.3 Dashboard list — unify + fix the dot

- Add `position:relative` to `.task-row.clean-list` so the absolute dot anchors
  to the row (fixes §2.3). It then shares `.task-row-actions` with the Planner.
- Collapse the duplicated `.clean-list` action CSS into the shared
  `.task-row-actions` rules so both views render actions identically.
- Mobile now behaves like the Planner: secondary actions (Edit / Skip subject /
  Skip) collapse behind the ⋯, whose reveal already works (`moreActionsId` →
  `expanded-actions`).

### 4.4 Focus studio

- `#t-label`: drop `text-transform:uppercase` and `letter-spacing:2px`, set to
  sentence case with `letter-spacing:.02em` — "focused / paused / ready" instead
  of "FOCUSED / PAUSED / READY".

### 4.5 Liquid-OS deepening (per the recorded decision)

| Surface | New cue | Cost |
|---|---|---|
| Tracker bar | tier-2 translucent glass body + backdrop blur (so the v14 refractive rim refracts real content); conic live rim-light while clocked in | 1 floating layer — already budgeted (v14 §7 allows the tracker as one of the 4 blur layers) |
| Task rows | inset top-gloss hairline + hover lift/rim-brighten (mouse only); the active-clock row gains a soft success rim | background layers only — **no** per-row blur (v14 §10 explicitly forbids row glassmorphism) |
| Timer ring | a slow conic halo behind the ring (reuses `lgBeam`) | 1 composited layer, paused under reduced-motion |

All three sit behind the existing `prefers-reduced-motion` /
`prefers-reduced-transparency` / `forced-colors` guards (§6).

---

## 5. JSX changes (exact list)

1. `src/components/PlannerView.tsx` — `renderTask`: wrap the trailing buttons
   (Edit · Skip subject · `TaskClockButton` · ⋯ · Done/Undo · Skip) in
   `<div className="task-row-actions">…</div>`. No prop, handler, or conditional
   changes; the rating strip and lesson brief are unaffected.
2. `src/app/page.tsx` — **no change** (copy is preserved; the tracker structure
   already has `.tracker-status` / `.tracker-actions`).
3. `src/components/Dashboard.tsx` — **no change** (already has `.task-row-actions`).

---

## 6. CSS changes & cascade safety

### 6.1 New `v15` block (appended last, wins the cascade)

Contains: tracker layout/radius/chips/time/glass/live-beam; shared
`.task-row-actions`; `.task-row` nowrap + glossy hover; `.clean-list`
`position:relative`; `#t-label` casing; timer-ring halo. All new geometry is
token-driven; `lgBeam` / `--lg-angle` / `--gloss` / `--lg-rim` are reused, not
redefined; every pseudo-element used is verified free (`.tracker-task::before`,
`.timer-stage::before`).

### 6.2 Selector migrations (forced by §5.1 — these edit existing rules)

Every `.task-row > .btn` becomes `.task-row-actions > .btn` (buttons are now
nested); `.task-row > .chip` stays (the status chip remains a direct child). The
full list of migrated selectors, by line:

| Line | Rule (selector) |
|---|---|
| 156 | `.task-row > .btn,.task-row > .chip{…}` → `.task-row > .chip,.task-row-actions > .btn{…}` |
| 523 | same pattern (mobile) |
| 552 | `.task-row > .btn{order:2;…}` → `.task-row-actions > .btn{…}` (order moves to the wrapper) |
| 587 | `.task-row > .btn,.btn-xs,.btn-sm{white-space:nowrap}` |
| 1193 | `.task-row > .btn{padding:6px 9px;font-size:.67rem}` |
| 1735 | `.task-row > .btn{order:2}` → `.task-row-actions{order:2}` |
| 1891, 1893, 1894, 1910 | mobile declutter + ⋯ reveal → `.task-row-actions > .btn…` |
| 1968, 1969 | `.modal-box .task-row > .btn…` |
| 2064 | `.task-row > .btn{padding:5px 10px…}` |
| 2768, 2769 | `.task-row > .btn.task-clock…` |
| 3555, 3558 | touch-target `min-height:var(--tap)` + the `>640px` compact rule |
| 4561 | `.task-row > .task-primary{margin-inline-start:auto}` → `.task-row-actions > .task-primary{…}` |

Lines that already match the new structure and stay untouched: 546 (`task-dot`),
551 / 1734 / 1892 / 1895 / 1897 / 1898 (chips remain direct children), 1510
(`.task-row > *{align-self:center}` now correctly includes the wrapper).

### 6.3 Guard rails (v14 §8, re-applied)

* `@media (hover:none) and (pointer:coarse), (max-width:820px)` → tracker blur
  downgrades to the 14px budget; touch never runs the new hover gloss.
* `prefers-reduced-motion: reduce` → live beam and timer halo are `animation:none`.
* `prefers-reduced-transparency: reduce` → tracker body returns to
  `--surface-elevated`, `backdrop-filter:none`.
* `forced-colors: active` → the live beam pseudo is hidden like the other
  decorative pseudo-layers.
* No theme, mode, or breakpoint band loses a rule it currently has; `mode-young`
  / `mode-focused` inherit sane values because the rules reference tokens.

---

## 7. Copy changes

**None.** The tracker chips, statuses and button labels keep their strings. The
"mashed" reading is produced by the CSS (`text-transform:uppercase`,
`letter-spacing:.6px`, accent fills, the `space-between` gutter) and is fixed
there. The exam chip stays `85d to Nov 20, 2026` — now a muted sentence-case
caption.

---

## 8. Acceptance criteria

* `npm run check` (typecheck + `--max-warnings=0` lint + tests) and
  `npm run build:app` green — the build proves Tailwind 4 / LightningCSS accept
  every new rule.
* Tracker reads as one sentence (state · task on a line, crisp tabular time,
  muted captions, one filled CTA); the bar is translucent glass with a visible
  rim, and gains a rotating rim-light while clocked in.
* Planner rows: no orphan buttons mid-row at 360 / 430 / 860 / 1366 / 2560;
  actions wrap as a right-aligned block; Done always right-most.
* Dashboard and Planner rows share the same action styling and the same mobile
  ⋯ behaviour; the Dashboard dot no longer drifts.
* `body.focus-live` mobile tracker keeps today's behaviour (chips hidden, touch
  height, breathing Clock Out) — verified at 360 and 430.
* Grep check: no new `style={{ padding/fontSize/borderLeft` in the touched
  views; no `text-transform:uppercase` remains on `.chip` in the tracker path.
* No new scrollbars, no clipped text, no element moves more than its padding
  delta vs today.

---

## 9. Explicitly rejected

* **Pure "normal / flat" restyle** — deleting the v11–v14 glass layer
  contradicts the existing material system and risks all 7 themes (§1).
* **Per-row backdrop blur (real glassmorphism on task rows)** — 60+ rows × blur
  is the exact cost the v11 "quiet glass" guidance forbids; rows get gloss +
  rim-light (background layers) instead.
* **CSS-only row fix without a wrapper** — a `grid-template-areas` / nth-child
  approach on direct children is fragile and diverges from the Dashboard's
  already-correct `.task-row-actions`; the wrapper is the one change that makes
  both views identical.
* **Removing "Skip subject"** — it is a real, used action; it moves into the
  actions sub-row and behind the ⋯ on mobile, never disappears.
* **Shortening or removing the exam chip** — the user chose to keep
  `85d to Nov 20, 2026`; it is restyled, not rewritten.

---

## 10. Resolved decisions

* Direction: **more liquid OS + legibility** (user-selected).
* Exam chip: **keep the full date**, restyled (user-selected).
* The treatment is otherwise as specified in §4–§6 and implemented next.

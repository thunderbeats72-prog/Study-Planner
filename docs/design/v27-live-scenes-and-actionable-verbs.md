# v27 — Live scenes on Subjects / Analytics / Settings, and Edit & Delete that are actually reachable

Design note for two related passes: (1) making the two least visible controls
in the product — Edit and Delete — into real, tappable, confirmed verbs, and
(2) giving Subjects, Analytics and Settings the same *live* header
illustration the Focus and Planner pages already had.

## The problem

| Symptom | Actual cause |
|---|---|
| Edit / Delete on a subject card "too small and barely visible" | `.btn-ghost` was referenced by eight controls and **defined nowhere**: a 30×30 box, transparent border, 13px glyph, ambient text colour — below the 44px touch floor the rest of the app keeps |
| Delete was one `window.confirm()` away | an OS chrome dialog that ignores every theme, is suppressed in some embedded browsers, and cannot say what will be lost |
| Task rows could not be deleted at all | the ⋯ menu offered Edit/Skip/Reopen but no destructive verb; `DELETE /api/tasks` existed and was simply unreachable from the UI |
| Subjects / Analytics / Settings opened with a bare header | Overview, Planner and Focus each carried a scene; these three did not, so the product read as two design systems |
| Editing a subject saved from the preview failed with 400 | difficulty is stored capitalised (`"Easy"`) but preview/legacy rows carry `"hard"`; the PATCH boundary rejected the casing and an Edit died on it |

## The principle

**One system, real data.** The new scenes reuse the exact illustration contract
from `Illustrations.tsx` — one 560×340 canvas, the shared desk/plant/books/
sparkle helpers, colours read from the `--ill-*` and `--accent` tokens — and
differ only in that they are *driven by state*: subject mastery, the last
seven days of logged minutes, the configured pomodoro and toggles. The header
visual is a second read-out of the page, never wallpaper.

Motion is deliberately cheap and honest:

- one mount flip (`useSettled`) so bars, arcs and rings animate from zero to
  the real value, then ride CSS transitions on later data changes;
- loops only where they mean something — the mastery dial's dashed halo, the
  screen scan, the gears, the LED — all `transform` / `opacity` /
  `stroke-dashoffset`, i.e. compositor work, no per-frame React renders;
- the analytics monitor's clock is the only ticking JS (one render / 30s);
- `prefers-reduced-motion` stops every loop **and** pins the drawn end-state
  of anything that draws itself in (`[style*="drawStroke"]`), because freezing
  a dash-offset animation mid-way would leave the tick invisible — the frozen
  chart still has to be true.

## What changed

- `Illustrations.tsx`: `CurriculumScene`, `InsightsScene`, `StudioScene`, on
  the shared canvas and tokens; `useSettled` + `dashFor` helpers.
- `bits.tsx`: `PageHead` gains `artLive` (a data scene keeps a compact
  centred slot on phones instead of disappearing below 860px); new shared
  `ConfirmDialog` (alertdialog, Escape + hardware Back cancel, focus lands on
  the safe verb).
- `SubjectsView`: Edit / Delete are icon+word buttons (`.subj-action`) —
  38px tall, 44px on touch, real surface/border/hover/active/focus states, and
  they split a full row below 480px so no label ever clips; Delete goes
  through `ConfirmDialog`. Header carries `CurriculumScene`.
- `TaskActions`: menu rows are icon chip + label, 40px (46px on touch); a
  separated, danger-styled **Delete task** appears only when the page supplies
  `onDelete`, confirms via `ConfirmDialog`, and hands the id up.
- `page.tsx` → `Dashboard` / `PlannerView` / `TaskCard`: `deleteTask` wired
  end-to-end; a session clocked into a deleted task banks its minutes first,
  and an editor open on it closes instead of pointing at nothing.
- `api/subjects`: difficulty is titled at the boundary before validation, so
  an Edit never fails (or falsely re-generates the curriculum) on casing.
- `ui-system.css` §27: the ghost-button definition, the subject footer and
  verb sizing, the menu-row treatment, the confirm dialog, scene plumbing
  (mobile slot, hover answers on fine pointers) and the reduced-motion guard.
  `!important` count *fell* by one: the phone rule that hid header scenes no
  longer needs it, because a `.scene-live` scene opts back in by specificity.

## Guarded by the suite

- the ⋯ menu's contents are asserted by reading labels out of the icon+text
  subtree (`textOf`), and the primary verbs are still outside the popover;
- Delete is asserted to be gated: first tap opens the in-app `alertdialog`,
  only the confirm tap calls the page handler, with exactly the right id;
- `deploy-package/src` stays a byte-exact mirror of `src/`;
- `ui-audit --budget` stays inside the frozen ceilings (conflicts, type
  literals, `!important` all flat or down).

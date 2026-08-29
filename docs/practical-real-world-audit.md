# Study Planner Pro — Practical Real-World Audit

This enhancement pass follows the existing product instead of redesigning it. The goal is real-world utility: a smaller set of useful actions, less manual work, clearer priorities, and better recovery when plans change.

## Removed

- No major navigation, theme, timer, focus, subject, curriculum, analytics, or planner feature was removed in this pass.
- Decorative/UI systems were left intact because the request explicitly called for enhancement rather than a redesign.

## Improved

- **What should I do now?** — Dashboard now derives a simple deterministic next-action priority from overdue status, near-term dates, revision work, task duration, and schedule position.
- **Backlog handling** — Overdue work is framed as a recovery decision rather than something that should all be crammed into today.
- **Quick task capture** — Dashboard now exposes a lightweight Quick Add path using only title, minutes, and optional subject.
- **Task editing** — Task editor copy was simplified so users can change the essentials without feeling like they are filling out a large workflow.
- **Mobile layout for new controls** — Added responsive styles for the new next-action and Quick Add surfaces while preserving existing breakpoints and theme tokens.

## Added

- `src/lib/prioritization.ts` — small, deterministic prioritization helper; intentionally avoids introducing another AI planning layer.
- `src/lib/prioritization.test.ts` — unit coverage for overdue-first, priority labeling, and revision handling.
- `src/app/practical-enhancements.css` — additive styles for the practical UI additions.

## Kept

- Existing dashboard/navigation architecture.
- Existing study clock, offline session queue, automatic task completion, spaced recall, planner views, subjects/lessons, focus/Zen mode, themes, and AI tutor.
- Existing scheduler logic and existing visual language.

## User scenarios considered

- Secondary-school student who needs a clear daily next step and homework awareness.
- Board/exam student with revision, mock work, deadlines, and backlog.
- College learner balancing multiple subjects and assignments.
- Competitive-exam learner with a large syllabus and revision workload.
- Working professional with limited/variable daily study time.

## Technical validation

- Repository structure and changed source files were inspected through the GitHub connector.
- A local `git clone`/runtime validation attempt was blocked because this execution environment could not resolve `github.com`.
- Therefore build, lint, typecheck, and the full test suite are **not claimed as executed** in this environment.

## Remaining opportunities

- Improve true one-tap Quick Add state refresh without a page reload by wiring it directly into the parent state mutation path.
- Consider deadline-aware exam weighting only if the existing domain model exposes enough reliable exam/topic relationships to make that signal actionable.

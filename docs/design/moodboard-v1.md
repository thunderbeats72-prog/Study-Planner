# Study Planner Pro — Professional Moodboard v1

## Art direction

**Mood:** Quiet confidence · focused intelligence · editorial study desk · premium software.

Imagine a modern library table at 7:30am: warm paper, graphite, a laptop, one violet bookmark, soft daylight, no clutter. Translate that feeling into software: neutral surfaces, precise type, subtle structure, one clear accent, useful motion.

## Visual keywords

`editorial` `calm` `precise` `warm-neutral` `intelligent` `quiet-luxury` `focused` `tactile` `human` `high-craft`

## Anti-mood

`generic SaaS` `AI template` `neon` `purple everywhere` `rainbow KPI` `cartoon education` `plastic 3D` `busy glassmorphism` `stock-photo student` `bouncy motion`

## Palette moodboard

Primary canvas — warm paper `#F7F6F3`

Primary surface — clean white `#FFFFFF`

Ink — deep graphite `#262421`

Secondary ink — stone `#6F6A63`

Accent — intelligent iris `#635BFF`

Accent soft — lavender paper `#EEECFF`

Success — restrained green `#167A57`

Attention — muted amber `#9A6700`

Risk — muted coral `#B13B31`

The palette is intentionally narrow. Most pixels should be neutral. Accent appears where the user needs to act or orient themselves.

## Typography moodboard

**Inter / system sans** for the product interface: crisp, neutral, high legibility.

**UI feel:** medium-weight headings, normal body copy, generous line-height, tabular numerals for timers and metrics.

**Optional editorial display:** system serif / ui-serif only for quotes, onboarding statements, and brand storytelling. It should create contrast, not split the interface into two competing visual systems.

## Imagery board

### Image family A — Editorial desk

A close, natural photograph/render of a quiet study desk: cream paper, graphite pencil, muted notebook, laptop corner, soft directional light, shallow but believable depth of field.

**Use:** onboarding hero, empty states, marketing/landing surfaces.

### Image family B — Material detail

Paper texture, pencil marks, tabbed pages, subtle desk grain, restrained shadows.

**Use:** feature illustrations and background crops.

### Image family C — Architectural quiet

Library shelves, reading-room geometry, morning window light, clean desk surface.

**Use:** occasional brand moments. Never as full-bleed clutter behind functional UI.

### Avoid

People posing at a desk, fake holograms, floating books, excessive bokeh, impossible object arrangements, neon UI overlays, overly sharp 3D illustrations, cliché graduation imagery.

## Illustration board

Prefer scenes made from a small vocabulary:

- desk plane
- paper sheet
- open book
- pen/pencil
- laptop edge
- calendar block
- focus ring
- small plant/leaf as a rare secondary motif

Perspective should be coherent across scenes. Use 3–5 colors maximum per illustration. Keep outlines subtle. Illustration should support product meaning, never become the hero over the task.

## UI composition references

The benchmark pattern is: strong hierarchy + restrained color + predictable spacing + accessible tokens. Notion's recent design work explicitly focused on consistent spacing/margins and predictable visual rhythm; Stripe's app guidance likewise encourages tokenized, consistent components with a high accessibility bar. citeturn808576search5turn808576search0

For study-planner references, many current concepts place tasks, schedule, progress and focus into one system, but commonly overuse colorful cards and purple gradients. Study Planner Pro should retain the information architecture while moving toward editorial restraint. Examples reviewed included Dribbble study dashboards and current student-dashboard concepts. citeturn634002image0turn634002image3

## Dashboard visual storyboard

### Frame 01 — Arrival

Top-left: compact product wordmark.

Main headline: “Good morning.”

Immediately below: a single recommendation card with a strong task title, duration, reason, and Start action.

Background is almost entirely neutral.

### Frame 02 — Today

A quiet list of remaining tasks. Each row has:
- small subject marker
- task title
- due/status metadata
- duration
- single primary action
- overflow menu for the rest

The list should feel like a professional work queue rather than a kanban board.

### Frame 03 — Progress

Three compact metrics: completion, study time, consistency. Neutral surfaces. Numbers carry visual weight; colored panels do not.

### Frame 04 — Intelligence

A clean insight panel: “Physics is fading — 20 min review recommended.” Include why and an optional action.

### Frame 05 — Reflection

A small editorial quote/weekly reflection block. It should be quiet and visually optional.

## Planner visual storyboard

Calendar and list sit inside the same visual system. The selected day uses accent iris; subject colors appear as small identity markers, not full-card fills.

Quick Add should feel like a command, not a colorful widget tray.

Task rows should align to a strict vertical rhythm so scanning is effortless.

## Focus visual storyboard

The timer becomes the visual center of gravity.

Use a large, high-contrast timer with a thin progress ring. Current task sits above/below with a one-line context. Controls are sparse.

Active session: subtle motion.

Paused: no pulse.

Break: soft attention state.

No decorative animation around the rest of the page.

A current smart-study reference shows a clean Pomodoro timer and separate progress/insight surface; this separation is a useful pattern for Study Planner Pro. citeturn634002image2

## Mobile moodboard

Mobile should feel like a native productivity app, not a compressed desktop dashboard.

Use:
- 16px horizontal gutters
- 44px minimum touch targets
- bottom-safe-area awareness
- sticky compact header only when useful
- single-column flow
- fewer simultaneous metrics
- large readable task title

A current AI planner reference demonstrates a useful pattern: calendar context + key metrics + today's schedule, but Study Planner Pro should simplify the visual layer and remove the gradient-heavy, novelty-driven treatment. citeturn634002image4

## Motion moodboard

Think of motion as a physical interface: paper settling on a desk, a drawer opening, a selection moving into place.

Motion should communicate:
- state change
- spatial relationship
- task completion
- system feedback

Motion should NOT communicate:
- “look at this animation”
- fake AI magic
- constant ambient movement

Recommended baseline: 120–220ms for micro/interactions, ~260ms for larger navigation transitions, using smooth ease-out / gentle spring curves without overshoot. This is aligned with the restrained motion philosophy documented in the research reference and is consistent with modern productivity UI. citeturn808576search1

## Texture & depth

Use depth with:
1. surface contrast
2. 1px borders
3. very soft shadows
4. restrained image texture

Do not stack blur + shadow + gradient + glow simultaneously.

## Brand photography treatment

Natural light, neutral temperature, realistic materials, imperfect-but-controlled composition.

Image should look like something a design studio art-directed, not a prompt-engineered stock image.

Recommended crop: preserve a large area of negative space so overlaid copy remains clean.

## Signature details

**The Iris Line:** a 2–3px accent line or tiny iris marker can appear beside the currently recommended task.

**Study Mark:** one small recurring visual motif — a simple bookmark/tab shape — used sparingly in onboarding, empty states and brand materials.

**Quiet AI:** a small four-point spark or iris-dot mark for Shigun/AI guidance. Never a glowing blob.

## Brand checklist

Before shipping a screen, ask:

1. Can I identify the primary action in under two seconds?
2. Does color help me understand state, or is it decorating the page?
3. Would this look credible in a premium productivity product?
4. Are the margins and baselines visibly intentional?
5. Is there any animation happening that does not help me?
6. Does the imagery look art-directed and believable?
7. Does the UI still look coherent in dark mode?
8. Does it look like Study Planner Pro rather than a generic AI template?

## Research references

- Notion: recent page design update emphasizing consistent spacing and rhythm. citeturn808576search5
- Notion Brand Guidelines. citeturn808576search7
- Stripe app design guidance: design tokens, consistency, accessibility. citeturn808576search0turn808576search2
- Study Planner dashboard visual benchmark. citeturn634002image0
- Smart Study / focus and insight pattern benchmark. citeturn634002image2
- Student dashboard benchmark. citeturn634002image3
- AI planner mobile benchmark. citeturn634002image4

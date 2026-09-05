# Study Planner Pro — Redesign Brief v1

## Goal

Upgrade the product from a visually basic / AI-generated-feeling study dashboard into a polished, premium study operating system while preserving the existing product logic and information architecture.

This is a **visual quality reset**, not a feature rewrite.

## Existing strengths to preserve

The current repository already has sophisticated product behavior: the Overview is deliberately centered around “What should I do now?”, backlog recovery is capacity-aware, Quick Add exists, task secondary actions are consolidated, Planner uses List + Calendar, Focus has a study clock, the product has analytics/ML intelligence, AI tutoring, themes, and mobile/accessibility accommodations. These are valuable foundations and should not be thrown away. fileciteturn7file0L2-L2

## Highest-priority redesign changes

### P0 — Establish the new visual foundation

Replace the current default visual tokens with the v1 brand system:
- warm neutral canvas;
- neutral surfaces;
- graphite text;
- iris accent;
- restrained semantic colors;
- 4px spacing scale;
- 8/12/16px shape language;
- 3 elevation levels.

The current CSS already centralizes design tokens and themes in `src/app/globals.css`, making token-level migration practical. The current system, however, relies heavily on purple/AI gradients, large 8–22px radii, radial background gradients and multiple theme-specific accent systems. fileciteturn6file0L2-L2

### P0 — Re-art-direct imagery

Audit all `StudyScene` / `.webp` visual assets.

Replace weak/generated-looking scenes with a coherent editorial still-life family. The repo currently includes visual assets such as `dashboard-lamp-studio-scene.webp` and `focus-clock-studio-scene.webp`; these should be treated as replaceable art-direction assets, not permanent UI chrome. fileciteturn4file0L2-L2

New scene system:
- dashboard: quiet desk + planner + laptop edge;
- planner: calendar paper / annotated schedule;
- focus: timer + notebook / lamp, minimal;
- subjects: study materials arranged by subject;
- settings: stationery / controls, very subtle.

All scenes use the same lighting, camera language, palette and perspective.

### P0 — Clean up dashboard hierarchy

Keep the product's strongest concept — “What should I do now?” — as the visual hero. The current component already implements ranked next-action logic and a primary task-first dashboard. Redesign the surface around this hierarchy rather than replacing the behavior. fileciteturn9file0L2-L2

Order:
1. Greeting + date context.
2. Next-best task hero.
3. Today's task queue.
4. Compact progress snapshot.
5. Intelligence / insights.
6. Reflection / quote.

The dashboard should not open with a wall of metrics.

### P0 — Remove “AI template” visual tells

Eliminate:
- decorative purple radial background wash;
- glowing/conic decorative elements;
- gradient-heavy KPI cards;
- saturated rainbow cards;
- animation that plays without a state change;
- generic 3D/floating education graphics;
- excessive pills.

AI should still feel sophisticated, but its sophistication comes from recommendation quality and context, not decoration.

## P1 — Component redesign

### Navigation

Expanded rail: 232–248px.

Brand mark: monochrome by default, iris only as a small brand detail.

Active item: soft iris background + ink/iris text. No glow.

Collapsed rail: same visual language; active item remains the only highlighted state.

### Buttons

Primary: solid iris, 8px radius, medium weight.

Secondary: white/neutral surface + border.

Tertiary: text/icon action.

Press: translateY(1px) or subtle scale only; no bounce.

### Cards

Standard: white surface, 1px neutral border, 12px radius, subtle shadow.

Featured: 16px radius, slightly stronger elevation; use sparingly.

Avoid every section becoming a card. Some sections should sit directly on canvas.

### Task rows

Target geometry:
`status → title → metadata → duration → primary action → overflow`

On desktop, maintain a single readable baseline. On mobile, stack only where necessary.

Secondary actions remain inside the overflow menu.

### Chips / tags

Use only for:
- subject identity;
- task type;
- filters;
- compact state.

No decorative chips.

### Charts

Charts should use one primary accent + neutral guides. Semantic comparison may introduce one secondary color, but never rainbow charts.

### Empty states

Replace empty-state placeholder art with editorial line illustrations or one art-directed image crop plus a clear next action.

## P1 — Focus Studio

Visual center = timer.

Suggested composition:
- header context
- timer / ring
- task title
- start/pause/clock-out
- session stats
- ambient controls

Current timer state mapping is already well-defined: active recording, paused, and break are visually distinct. Preserve that logic while stripping ornamental movement. fileciteturn5file0L2-L2

## P1 — Planner

The current Planner already uses List + Calendar and has Quick Add; keep that model. fileciteturn5file0L2-L2

Redesign around:
- one clear date control;
- compact segmented view switch;
- calmer calendar cells;
- subject identity markers;
- task rows that read like a work queue;
- Quick Add as a high-quality input surface.

## P1 — Mobile

Treat mobile as its own composition, not a scaled desktop.

The repository already has dedicated mobile header/drawer behavior and 44px touch-target/accessibility work. Preserve those constraints and redesign the visual density within them. fileciteturn5file0L2-L2

Target:
- 16px page gutter;
- 44px controls;
- single-column flow;
- clear sticky/compact header;
- fewer visible analytics blocks;
- one primary action per section.

## P1 — Theme system

Unify themes under one brand architecture.

The current product has default, dark, obsidian, nebula, mint and sunset themes, each with materially different accents. fileciteturn6file0L2-L2

New rule: themes change atmosphere, not brand grammar.

That means:
- same spacing;
- same component geometry;
- same semantic color roles;
- same type scale;
- same iconography;
- same motion language.

Suggested named presets:
- Paper / default
- Ink / dark
- Ocean / blue-neutral
- Forest / mint
- Ember / warm

Avoid a separate “brand” feeling for every theme.

## P2 — Motion quality pass

Audit all transitions in:
- navigation;
- tab changes;
- dropdowns;
- modal appearance;
- KPI count-up;
- task completion;
- timer state;
- toast;
- Quick Add.

Rules:
- 100–150ms micro;
- 160–220ms standard;
- ~260ms major navigation;
- no bounce;
- no elastic overshoot;
- no perpetual ambient motion;
- `prefers-reduced-motion` remains mandatory.

The existing codebase already has motion/reduced-motion handling; migrate effects instead of adding a second motion system. fileciteturn5file0L2-L2

## P2 — Image quality acceptance test

Every image should pass:

**Realism:** materials and light look physically believable.

**Consistency:** all scenes look like they were produced in the same art direction.

**Restraint:** image supports the interface rather than dominating it.

**Resolution:** no visible compression, awkward edges, or synthetic-looking details.

**Context:** every image says something about studying/planning/focus; no generic “productivity” stock imagery.

## Suggested implementation sequence

### Phase A — Tokens & foundations

Edit `src/app/globals.css` and shared CSS tokens. Replace the current visual foundation without touching API/state behavior.

### Phase B — Shell

Restyle app shell/sidebar/tracker/mobile header and shared buttons/cards/menus.

### Phase C — Dashboard

Redesign `Dashboard.tsx` composition and associated styles. Preserve its existing prioritization, analytics and task actions.

### Phase D — Planner + Focus

Restyle Planner and Focus; update imagery and state-specific motion.

### Phase E — Subjects + Settings + Chat

Bring the remaining surfaces into the same brand grammar.

### Phase F — Asset replacement

Replace all dated/generated visual scenes; optimize file size and responsive use.

### Phase G — Quality pass

Check desktop 1440, laptop 1280, tablet 1024, phone 390/430 widths.

Verify dark + at least two other theme presets.

Run TypeScript, lint, tests, and production build.

## Definition of done

A reviewer unfamiliar with the repo should describe the product as:

**“A premium, calm study workspace with a strong point of view.”**

They should not describe it as:

**“A colorful AI-generated dashboard.”**

## Scope discipline

Do not rewrite the scheduler, ML, AI provider system, database, API routes or task-completion logic as part of this visual redesign. Keep behavioral changes separate and explicit.

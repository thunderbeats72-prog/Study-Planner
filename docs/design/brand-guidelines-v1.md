# Study Planner Pro — Brand Guidelines v1

## 01. Brand direction

**Positioning:** A calm, intelligent study operating system that helps students decide what to do next, protect focus, and build consistent progress.

**Core idea to preserve:** the existing product already has the right product ideology: "what should I do now?", capacity-aware planning, recovery instead of guilt, focus sessions, AI tutoring, adaptive replanning, and progress intelligence. The redesign is visual and interaction-level, not a change to that philosophy.

**Desired perception:** premium, calm, credible, quietly intelligent, editorial, intentional.

**Avoid:** generic AI-dashboard aesthetics, noisy gradients, cartoon education imagery, excessive glassmorphism, oversized rounded cards, rainbow status colors, decorative motion, stock-photo energy, and visual density that competes with the study task.

## 02. Visual thesis

Study Planner Pro should feel closer to a premium productivity/workspace product than a gamified education app.

The UI uses a warm neutral canvas, strong typographic hierarchy, one recognizable primary accent, restrained semantic colors, deliberate whitespace, thin structural borders, and subtle depth. Color communicates state; it should not become decoration.

Reference principles from mature products:
- Notion demonstrates restrained color, warm neutrals, clear typography, and consistency of spacing/rhythm. Notion itself has recently described revisiting page designs specifically to make spacing and margins more predictable. [1]
- Stripe's app guidance emphasizes design tokens, constrained customization, consistent components, and accessibility as a quality bar. [2]
- Current study-planner UI references tend to overuse purple gradients and colorful KPI cards; we should retain the useful information architecture while removing the template-like visual language.

## 03. Brand personality

**Calm** — the app should reduce cognitive load rather than add stimulation.

**Focused** — one dominant action per surface; "next best task" is more important than dashboard decoration.

**Intelligent** — AI is visible through useful recommendations and microcopy, not glowing purple ornaments.

**Human** — photography/illustration, when used, should feel editorial and real rather than synthetic.

**Premium** — details matter: alignment, spacing, type scale, icon consistency, interaction states, empty states, and transitions.

## 04. Color system

### Primary light theme

| Token | Value | Role |
|---|---|---|
| Canvas | `#F7F6F3` | Main app background; warm paper-like neutral |
| Surface | `#FFFFFF` | Cards, panels, popovers |
| Surface subtle | `#F0EFEB` | Secondary surfaces, hover, inputs |
| Ink | `#262421` | Primary text |
| Ink secondary | `#6F6A63` | Secondary text |
| Ink tertiary | `#9A948C` | Metadata / placeholder |
| Border | `rgba(38,36,33,.10)` | Structural dividers |
| Accent / Iris | `#635BFF` | Primary actions, active navigation, focus ring |
| Accent dark | `#4F46D9` | Hover/pressed accent |
| Accent soft | `#EEECFF` | Selected background / subtle emphasis |

### Semantic colors

| Meaning | Background | Foreground |
|---|---|---|
| Success | `#E8F5EF` | `#167A57` |
| Attention | `#FFF2D9` | `#9A6700` |
| Risk | `#FCE9E7` | `#B13B31` |
| Informational | `#E8F0FA` | `#2F5F9E` |

Subject colors should use a **muted 6-color taxonomy**, not arbitrary saturated colors. Suggested hue families: iris, blue, teal, amber, coral, plum. Each subject receives a soft background + readable foreground pair. Subject identity must never rely on color alone.

### Dark theme

Use a near-black blue-neutral canvas rather than a pure black/purple gradient:
- Canvas `#0E0E11`
- Surface `#151519`
- Elevated `#1C1C22`
- Ink `#F4F2EE`
- Ink secondary `#AAA5A0`
- Border `rgba(244,242,238,.10)`
- Accent `#8D86FF`

Other themes may exist as presets, but **the product should no longer feel like six different brands**. Theme presets should modify accent/temperature while preserving the same structural neutrals, contrast, component geometry, typography, and motion language.

## 05. Color usage rules

1. Keep most of the interface neutral.
2. Use the accent primarily for action, selection, progress focus, and the current route.
3. Never make a KPI card red, green, yellow, and purple just because it is a different metric.
4. Never put text on a background unless the pair passes contrast checks.
5. AI should be signaled with the accent family plus an icon/label, not a permanent glow.
6. Gradients are allowed only in brand/marketing moments and selected high-emphasis controls. No background gradient washes.

## 06. Typography

**Primary UI font:** Inter / system sans fallback.

**Editorial display accent:** `ui-serif` only for rare marketing/onboarding statements, quotes, or feature headlines where a human/editorial voice is useful. Do not introduce a second typeface into dense app UI.

### Type scale

| Role | Size | Weight | Line height |
|---|---:|---:|---:|
| Display | 48px | 650 | 1.10 |
| Page title | 32px | 650 | 1.15 |
| Section title | 20px | 600 | 1.30 |
| Card title | 16px | 600 | 1.35 |
| Body | 15px | 400 | 1.55 |
| Label | 13px | 550 | 1.35 |
| Caption | 12px | 450 | 1.35 |
| Numeric KPI | 28–36px | 650 | 1.0 |

Use tabular numerals for timers, KPIs, streak counts and analytics. Tighten tracking only on large display text.

## 07. Layout & spacing

Adopt a **4px base spacing unit**.

Preferred rhythm: `4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 48 / 64`.

The app shell should feel spacious but not wasteful:
- Desktop outer padding: 20–24px.
- Sidebar width: 232–248px expanded.
- Main content max width: 1440px.
- Primary page gutters: 32–48px depending on viewport.
- Card padding: 16–20px.
- Dense rows: 12–16px vertical rhythm.

Whitespace is a feature. A screen should not feel "filled" simply because empty space was available.

## 08. Shape language

- Small controls: 8px radius.
- Standard cards: 12px radius.
- Featured hero surfaces: 16px maximum.
- Pills: reserved for tags, filters, compact status, and segmented controls.
- Avoid 20–30px bubbly corners across every component.
- Use 1px borders as the main structure; shadows are for hierarchy, not decoration.

## 09. Elevation

Three levels only:

**Level 0:** flat canvas + borders.

**Level 1:** card/panel `0 1px 2px rgba(30,27,24,.04), 0 8px 24px rgba(30,27,24,.05)`.

**Level 2:** popover/modal `0 12px 36px rgba(30,27,24,.14)`.

No floating neon shadows. No permanent glows.

## 10. Imagery & illustration

### New image direction

Replace generic AI-looking study scenes with an **editorial still-life system**:
- natural desk materials: paper, pencil, notebook, laptop edge, soft daylight;
- composed photographs or photorealistic renders with believable depth;
- neutral/cream environments with one brand-color detail;
- generous negative space;
- subtle grain or texture is acceptable;
- no people staring at camera, no exaggerated productivity poses, no cliché piles of books.

### Illustration direction

When an illustration is required, use simple geometric/editorial scenes with consistent perspective and a restrained palette. Avoid shiny 3D blobs, surreal AI-generated objects, floating neon icons, and overly detailed pseudo-realistic scenes.

### Image treatment

Hero image ratio: 16:9 or 4:3, with 12–16px corner radius.
Keep subject/background contrast high enough that the image reads quickly at a glance.

## 11. Iconography

Use one icon family with consistent stroke weight and optical sizing. Default: 1.75–2px stroke, rounded line caps, 18–20px UI icons. Avoid mixing filled emoji-like icons with outline product icons.

The active navigation state should be indicated by background + icon/text weight, not a glowing icon.

## 12. Motion language

Motion should feel **precise, soft, and functional**.

| Interaction | Duration | Easing |
|---|---:|---|
| Hover / icon state | 120ms | ease-out |
| Button press | 100ms | ease-out |
| Dropdown / popover | 160ms | `cubic-bezier(.25,.46,.45,.94)` |
| Card transition | 180ms | ease-out |
| Page/view transition | 220ms | `cubic-bezier(.22,1,.36,1)` |
| Sidebar | 260ms | `cubic-bezier(.22,1,.36,1)` |

Do not use bounce, elastic overshoot, spinning ornamentation, constant floating, or simultaneous multi-element entrance animations.

### Focus timer motion

The timer is the one place allowed more personality. Use a calm progress ring/pulse tied to actual study state. The pulse is visible only while actively recording. Paused = still. Break = soft attention tone. Reduced-motion users get static equivalents.

## 13. Dashboard composition

The current product ideology is correct: the dashboard should answer **"What should I do now?"** first.

New visual hierarchy:

1. **Primary hero:** one recommended task, reason, duration, subject, and Start action.
2. **Today plan:** compact list of remaining tasks with strong hierarchy and quiet controls.
3. **Progress snapshot:** 3–4 restrained KPIs, preferably monochrome/neutral cards with one accent signal.
4. **Progress intelligence:** weekly study pattern, memory/readiness insights, recovery recommendation.
5. **Reflection / quote:** visually quiet, optional.

The hero should look like a confident product surface, not a promotional banner.

## 14. Planner composition

Planner is the operational workspace.

- Clear date context at top.
- List and calendar remain the primary views.
- Quick Add is a single compact capture affordance.
- Each task row exposes only the primary action; secondary actions live in the overflow menu.
- Use consistent 8–12px vertical rhythm and strong baseline alignment.
- Avoid excessive colored subject cards; use a small subject marker + text.

## 15. Focus composition

Focus should feel like the app's quiet room.

- Large timer.
- Current task and subject.
- One obvious primary action.
- Ambient controls low-contrast and secondary.
- Progress and session details beneath, not around the timer.
- No giant decorative imagery competing with the countdown.

## 16. AI / Shigun presentation

AI should feel integrated into the product instead of bolted on.

- Use a small spark/assistant icon and restrained accent label.
- Messages should look like product guidance, not chatbot marketing.
- Recommendations should cite the reason: deadline, readiness, weak subject, or remaining capacity.
- Never display an "AI" badge next to every AI-generated piece of copy.
- Avoid purple glow effects around every AI surface.

## 17. Copy voice

**Voice:** calm, concise, intelligent, encouraging without being childish.

Prefer:
- "Start with Calculus — 45 min"
- "You have 82 min left today"
- "Physics is fading; a short review is due"
- "Let's recover 2 unfinished tasks"

Avoid:
- "Crush your goals!"
- "Unlock your potential 🔥"
- "AI MAGIC"
- overly motivational or guilt-heavy language.

## 18. Component quality bar

Every reusable component must have:
- default, hover, pressed, focus, disabled, loading and empty states where applicable;
- consistent 44px minimum touch targets on coarse pointers;
- keyboard focus treatment;
- dark-theme equivalent;
- reduced-motion behavior;
- no layout shift when icons/labels change;
- consistent truncation/wrapping rules.

## 19. What to remove from the current visual language

- pervasive purple gradients;
- radial background washes as decoration;
- oversized rounded UI cards;
- generic "AI-generated" study imagery;
- rainbow KPI cards;
- decorative animated halos/conic effects;
- visual effects that imply activity when nothing is happening;
- inconsistent theme identities that change the product's character;
- dense dashboard statistics placed above the primary task.

## 20. Brand success test

At a glance, a new user should think:

> "This is a serious, beautiful study workspace that understands how I study."

Not:

> "This is an AI-generated dashboard template."

## References used for research

[1] Notion, “Updating the design of Notion pages,” March 18, 2026: https://www.notion.com/blog/updating-the-design-of-notion-pages
[2] Stripe, “Design your app” / “Style your app”: https://docs.stripe.com/stripe-apps/design and https://docs.stripe.com/stripe-apps/style
[3] Notion brand guidelines: https://notion.notion.site/Notion-Brand-Guidelines-db8fda2d1f0048bba1f4e547dfc48830
[4] Current Study Planner visual references reviewed from current design galleries and student-dashboard examples, used for competitive pattern analysis rather than direct copying.

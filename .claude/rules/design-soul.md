---
paths:
  - "src/**/*.{tsx,css}"
  - ".storybook/**"
---

# Atoll Design Soul

> **"A deep-sea control room — in the dark, only what is alive glows."**
>
> Atoll is a precision instrument for creators. Not a toy, not a website.
> The feel of a camera body, a synthesizer, a cockpit — quiet and solid, with unmistakable signals.

## The three principles

1. **Light = state = life.** In the deep sea, only living things glow. Glow, emphasis, and motion are permitted only for *things that have state* (running, connected, selected, done). When static elements glow, the signal dies. 90% of the screen must stay sunk in darkness for the 10% of signal to live.
2. **The feel of a precision instrument.** Every alignment is intentional to the pixel. Ports sit exactly on border lines, numbers hold their place in monospace, hit areas are generous while visual sizes stay restrained. There is no "close enough" spacing — only multiples of the scale tokens.
3. **Quiet surfaces, hierarchy through depth.** Hierarchy is not made with color; it is made with depth (four surface levels + shadow/glow). Lagoon is a handful per screen — only for the protagonist (primary action, live signal). Coral is only for warnings and destruction. Lose this discipline and it isn't Atoll — it's just another dark theme.

## Concrete discipline

**Typography**
- UI body text is Pretendard (optimized for Korean); numbers, coordinates, credits, and model IDs must use `--font-mono`. The instant a number wobbles in a proportional font, the precision-instrument feel dies.
- Sizes come only from scale tokens. Try weight and color for emphasis before size.
- A display moment like the dashboard title may use a typeface with character — but there is exactly one display typeface in the whole app.

**Motion — breathing and reflexes only**
- Interaction feedback finishes within `--default-transition-duration` (0.15s). UI slower than the hand is not an instrument.
- **Async action buttons must show progress feedback** — spinner (`shared/Spinner`) + disabled immediately on click, released on completion/failure. An async button without feedback is a quality defect.
- Sustained motion only expresses "aliveness": generation pulse (breathing), spinners (work), connection flow. No decorative infinite animations.
- Entrances/exits are short with `--ease-out`. No bounce or overshoot — that makes it a toy.

**Depth and light**
- Floating things (toolbars, menus, dialogs) use `--shadow-raised`; living signals use `--glow-accent`. Do not improvise any shadow or glow beyond these two.
- The canvas background is a plain solid color (`--bg-canvas`) — the dot grid was removed by a deliberate decision. Ask the maintainers before proposing texture again.

**Space**
- Density is the life of the node canvas: generous whitespace outside cards, tight inside them.
- Don't fear asymmetry — dashboards and empty states have intentional composition, not a row of centered boxes.

## Quality ritual — world-class comes from inspection

- Components with states get **a story for every state**, and before declaring done, **take a screenshot and look at it**. Passing code isn't finished until eyes confirm it.
- Screenshot self-review checklist: ① any 1px misalignment ② anything floating that should sit on a border ③ lagoon shouting from more than one place ④ text hierarchy resolved within three levels (primary/secondary/muted) ⑤ can you say "this is Atoll" from this screen alone?
- Put it side by side with best-in-class references — not to copy, but as the baseline for density and finish.

## Forbidden — the moment you do this, it becomes ordinary

- Purple gradients, glassmorphism overuse, evenly distributed palettes
- Inter/Roboto/Arial default-feel, emphasis by size alone
- Purposeless hover scale-ups, card-grid-only layouts, center-alignment as a universal answer
- Improvised colors, sizes, or shadows outside the tokens

---
paths:
  - "src/**/*.{ts,tsx}"
---

# React / Frontend Rules

## State management — Context + useReducer

- No global state libraries. **Per-domain Context + `useReducer`** is the default.
- Split contexts by domain (e.g. canvas / provider connections / job queue). Do not build one giant app store.
- State that is sufficient locally stays in `useState`. Promote to global only when two or more screens share it.
- Don't store derived values in state — compute them at render time or with `useMemo`.

## Tauri IPC — wrap in hooks

- Components never call `invoke()` directly. Wrap IPC calls in **custom hooks** that return loading/error/result consistently.
- IPC command names and payload types are defined in one place. Strings must not scatter across components.

## Styling — CSS Modules

- **CSS Modules** (`*.module.css`) only. Avoid CSS-in-JS, Tailwind, and global classes.
- Global CSS is only for resets and CSS variables (color/spacing tokens). Never hardcode colors or spacing — reference the tokens.
- **Layout is tokens too** — page padding, card grid min-widths, and standard node widths (asset 208 / op 240 / model 300) come only from the layout tokens in `global.css` (`--layout-*`, `--grid-*`, `--node-width-*`). New nodes use one of the three standard widths. (Exception: asset nodes are resizable 160–560px via a handle, defaulting to the standard width — height follows the media aspect ratio.) See the design foundations pages in Storybook.
- **Sizes follow the Tailwind v4 scale tokens** (defined in `global.css`: `--spacing` multiples, `--text-*`, `--radius-*`, `--ease-*`, `--blur-*`). The app's base font size is `--text-xs` (0.75rem); reference scale tokens instead of hardcoded px.
- **Everything stateful is tokenized before it is styled.** Whether interaction states (hover, focus, active, selected, disabled) or domain states (idle, running, done, error) — never improvise per-state colors inside a component; define them as `global.css` tokens and reference them. Components with states get a story for every state, checked by eye.

## Folder structure — by feature

```
src/
  features/<domain>/     # components + hooks + reducers + styles grouped per domain
  shared/                # only things used by two or more features
  ipc/                   # Tauri IPC command definitions, types, wrapper hooks
```

- No layer-first layout (top-level components/, hooks/, utils/).
- The bar for `shared/` is "actually used in two or more places". Don't generalize preemptively.

## Storybook

- Reusable UI components get **stories alongside them** (`<Component>.stories.tsx`, in the same feature folder).
- Stories exist to verify styling consistency: the default state plus meaningful variants (loading, error, empty, …). Not for interaction testing.
- One-off screen-assembly components don't need stories. The bar: "used in two or more places, or defines design tokens."

## Components

- Extract logic into pure functions and hooks; keep components thin (ties into the testing rules: only pure functions are unit-tested).
- Use `React.memo`/`useCallback` optimizations only when a real performance problem has been measured.

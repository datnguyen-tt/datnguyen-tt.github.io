# Agent notes

Run `npm run check` before committing: it runs ESLint, `astro check`,
dependency-cruiser layer rules and vitest. CI runs the same command.

## Layers (enforced by `.dependency-cruiser.cjs`)

- `src/data`, `src/i18n`, `src/lib`: content and helpers; never import UI or effects.
- `src/fx/engine`: DOM-free simulation logic.
- `src/fx`: canvas effects; reached only via `src/scripts/fx-loader.ts`, not from components.
- `src/components`, `src/layouts`, `src/pages`: Astro UI. `cv.yaml` is the single content source.

## Judgment calls

- Use `createTimers()` from `src/lib/timers` instead of raw `setTimeout`. Files
  still on the baseline are listed in `eslint.config.js`; shrink it, never grow it.
- Baselines for non-null assertions are also in `eslint.config.js`.
- Commit messages: `[module] imperative summary`. Stage files by full path.

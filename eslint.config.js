import js from "@eslint/js";
import tseslint from "typescript-eslint";
import astro from "eslint-plugin-astro";
import globals from "globals";

const RAW_TIMER_MESSAGE =
  "Use `createTimers()` from `src/lib/timers` so pending timers are cancelled on teardown.";

// Baseline: files that still call setTimeout directly. Remove a file from
// this list when it moves to `createTimers()`; never add to it.
const RAW_TIMER_BASELINE = [
  "src/fx/terminal-typing.ts",
  "src/fx/erl-shell.ts",
  "src/scripts/scroll-rail.ts",
  "src/scripts/site.ts",
  "src/scripts/intro.ts",
];

// Baseline: files that still use non-null assertions (`!`). Required today by
// noUncheckedIndexedAccess on arrays and canvas contexts; shrink per file.
const NON_NULL_BASELINE = [
  "src/fx/beam-cluster.ts",
  "src/fx/commit-log.ts",
  "src/fx/mailbox-fifo.ts",
  "src/fx/send-message.ts",
  "src/fx/supervision-tree.ts",
  "src/fx/terminal-typing.ts",
  "src/fx/engine/*.ts",
  "tests/**/*.ts",
];

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      ".astro/**",
      "node_modules/**",
      "public/**",
      "docs/**",
      // eslint-plugin-astro cannot parse this template; `astro check` covers it.
      "src/components/Contact.astro",
    ],
  },
  js.configs.recommended,
  tseslint.configs.strict,
  astro.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      "@typescript-eslint/ban-ts-comment": [
        "error",
        {
          "ts-ignore": true,
          "ts-expect-error": "allow-with-description",
          minimumDescriptionLength: 10,
        },
      ],
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
  {
    files: ["src/**/*.{ts,astro}"],
    rules: { "no-console": "error" },
  },
  {
    files: ["src/fx/engine/scheduler.ts"],
    rules: { "no-console": "off" },
  },
  {
    files: ["src/fx/**/*.ts", "src/scripts/**/*.ts"],
    ignores: ["src/lib/timers.ts"],
    rules: {
      "no-restricted-globals": [
        "error",
        { name: "setTimeout", message: RAW_TIMER_MESSAGE },
      ],
      "no-restricted-properties": [
        "error",
        { object: "window", property: "setTimeout", message: RAW_TIMER_MESSAGE },
      ],
    },
  },
  {
    files: NON_NULL_BASELINE,
    rules: { "@typescript-eslint/no-non-null-assertion": "off" },
  },
  {
    // Pre-paint inline script: plain ES5 on purpose, it runs before any bundle.
    files: ["**/Base.astro/**"],
    rules: { "no-var": "off", "no-empty": "off", "@typescript-eslint/no-unused-vars": "off" },
  },
  {
    files: RAW_TIMER_BASELINE,
    rules: { "no-restricted-globals": "off", "no-restricted-properties": "off" },
  },
);

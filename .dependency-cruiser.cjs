/** Layer rules: see AGENTS.md for the map. */
module.exports = {
  forbidden: [
    {
      name: "engine-is-pure",
      severity: "error",
      comment: "src/fx/engine is DOM-free logic: it may not import scripts, components or other fx code.",
      from: { path: "^src/fx/engine" },
      to: { path: "^src/(scripts|components|layouts|pages|fx/(?!engine))" },
    },
    {
      name: "data-has-no-ui",
      severity: "error",
      comment: "Content (data, i18n, lib) must not depend on UI or effects.",
      from: { path: "^src/(data|i18n|lib)" },
      to: { path: "^src/(fx|scripts|components|layouts|pages)" },
    },
    {
      name: "components-not-fx",
      severity: "error",
      comment: "Components reach effects only through the lazy loader in src/scripts.",
      from: { path: "^src/components" },
      to: { path: "^src/fx" },
    },
    { name: "no-circular", severity: "error", from: {}, to: { circular: true } },
  ],
  options: {
    tsConfig: { fileName: "tsconfig.json" },
    doNotFollow: { path: "node_modules" },
    includeOnly: "^src",
    exclude: { path: "\\.d\\.ts$" },
  },
};

import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

export default defineConfig({
  site: "https://datnguyen-tt.github.io",
  // Project page: served under /datnguyenfolio/ (root is the legacy user site).
  base: "/datnguyenfolio",
  output: "static",
  trailingSlash: "ignore",
  // CSS is ~7 KB gzip: inline it to remove the render-blocking request.
  build: { inlineStylesheets: "always" },
  integrations: [
    sitemap({
      i18n: { defaultLocale: "en", locales: { en: "en", vi: "vi" } },
    }),
  ],
});

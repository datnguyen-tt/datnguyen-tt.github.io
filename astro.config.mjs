import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

export default defineConfig({
  site: "https://datnguyen-tt.github.io",
  // Old URLs from the al-folio site and the former /datnguyenfolio/ project page.
  redirects: {
    "/datnguyenfolio": "/",
    "/datnguyenfolio/vi": "/vi/",
    "/cv": "/",
    "/projects": "/#projects",
    "/projects/1_iot_backend": "/#projects",
    "/projects/2_ivr": "/#projects",
    "/projects/3_nso": "/#projects",
    "/projects/4_confd": "/#projects",
    "/projects/5_sbg": "/#projects",
    "/projects/6_master_thesis": "/#projects",
    "/projects/7_thesis": "/#projects",
    "/projects/8_sms": "/#projects",
    "/projects/9_project": "/#projects",
    "/publications": "/#publications",
    "/repositories": "/#projects",
  },
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

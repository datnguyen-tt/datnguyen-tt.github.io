// Build the site, serve it, render /?print with print media to A4 PDF.
// Run: npm run pdf   (needs: npx playwright install chromium)
import { copyFile, mkdir } from "node:fs/promises";
import { build, preview } from "astro";
import { chromium } from "playwright";

const PORT = 4399;
const OUT = "public/Dat_Nguyen_CV.pdf";

await build({ root: process.cwd(), logLevel: "warn" });
const server = await preview({
  root: process.cwd(),
  logLevel: "warn",
  server: { port: PORT, host: "127.0.0.1" },
});

let browser;
try {
  browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${PORT}/datnguyenfolio/?print`, { waitUntil: "networkidle" });
  await page.emulateMedia({ media: "print" });
  await page.evaluate(() => document.fonts.ready);
  await page.pdf({
    path: OUT,
    format: "A4",
    printBackground: true,
    preferCSSPageSize: true,
  });
  await mkdir("dist", { recursive: true });
  await copyFile(OUT, "dist/Dat_Nguyen_CV.pdf");
  console.log(`wrote ${OUT}`);
} finally {
  await browser?.close();
  await server.stop();
}

// Generates an OG SVG (kept out of public/, in node_modules/.cache) from
// src/data/cv.yaml and converts it to public/og.png (1200x630) with sharp.  Run: npm run og
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { load } from "js-yaml";
import sharp from "sharp";

const cv = load(readFileSync("src/data/cv.yaml", "utf8"));
const { meta, hero } = cv;
const esc = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const sans = "Inter, 'Helvetica Neue', Helvetica, Arial, sans-serif";
const mono = "'JetBrains Mono', Menlo, 'SF Mono', Consolas, monospace";

const wrap = (text, width) => {
  const rows = [];
  for (const w of text.split(" ")) {
    const last = rows.at(-1);
    if (last !== undefined && (last + " " + w).length <= width)
      rows[rows.length - 1] = last + " " + w;
    else rows.push(w);
  }
  return rows;
};
const shown = [0, 2, 3].map((i) => hero.terminal[i]).filter(Boolean);
const lines = shown
  .map(
    (l, i) =>
      `<text x="672" y="${278 + i * 70}" font-family="${mono}" font-size="22"><tspan fill="#9daabb">${esc(l.prompt)}</tspan> <tspan fill="#22d3ee">${esc(l.input)}</tspan></text>` +
      `<text x="672" y="${306 + i * 70}" font-family="${mono}" font-size="18" fill="#e6edf3">${esc(l.output)}</text>`,
  )
  .join("");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <pattern id="g" width="48" height="48" patternUnits="userSpaceOnUse">
      <path d="M48 0H0V48" fill="none" stroke="#ffffff" stroke-opacity="0.04"/>
    </pattern>
    <radialGradient id="r" cx="15%" cy="20%" r="60%">
      <stop offset="0" stop-color="#a90533" stop-opacity="0.35"/>
      <stop offset="1" stop-color="#a90533" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1200" height="630" fill="#0b0f14"/>
  <rect width="1200" height="630" fill="url(#g)"/>
  <rect width="1200" height="630" fill="url(#r)"/>
  <rect x="0" y="0" width="12" height="630" fill="#a90533"/>

  <g transform="translate(72 84)">
    <circle cx="48" cy="48" r="42" fill="none" stroke="#35475d" stroke-width="1.5" stroke-dasharray="3 6"/>
    <circle cx="48" cy="48" r="26" fill="#121a24" stroke="#ff6b8a" stroke-width="3.5"/>
    <circle cx="48" cy="6" r="4.5" fill="#22d3ee"/>
    <circle cx="86" cy="64" r="3.5" fill="#4ade80"/>
    <text x="48" y="49" text-anchor="middle" dominant-baseline="central" font-family="${mono}" font-weight="800" font-size="22" fill="#e6edf3">${esc(meta.initials)}</text>
  </g>

  <text x="72" y="300" font-family="${sans}" font-weight="800" font-size="84" fill="#e6edf3" letter-spacing="-3">${esc(meta.name)}</text>
  <text x="72" y="356" font-family="${sans}" font-weight="500" font-size="26" fill="#9daabb">${esc(meta.role.en)}</text>
  <text x="72" y="430" font-family="${sans}" font-weight="500" font-size="26" fill="#c9d4e0">${wrap(hero.headline.en, 34)
    .map((row, i) => `<tspan x="72" dy="${i ? 40 : 0}">${esc(row)}</tspan>`)
    .join("")}</text>
  <text x="72" y="560" font-family="${mono}" font-size="18" fill="#6b7d92">${esc(meta.tagline.en)}</text>

  <rect x="640" y="190" width="500" height="290" rx="14" fill="#0f151c" stroke="#35475d"/>
  <rect x="640" y="190" width="500" height="42" rx="14" fill="#121a24"/>
  <rect x="640" y="216" width="500" height="16" fill="#121a24"/>
  <circle cx="664" cy="211" r="6" fill="#a90533"/><circle cx="686" cy="211" r="6" fill="#35475d"/><circle cx="708" cy="211" r="6" fill="#35475d"/>
  <g>${lines}</g>
</svg>
`;

mkdirSync("node_modules/.cache", { recursive: true });
writeFileSync("node_modules/.cache/og.svg", svg);
await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile("public/og.png");
console.log("wrote public/og.png");

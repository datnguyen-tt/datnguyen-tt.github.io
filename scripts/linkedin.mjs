// Generate copy-paste-ready LinkedIn profile text from src/data/cv.yaml,
// with LinkedIn's field limits checked so nothing gets truncated on paste.
// Run: npm run linkedin            (English, writes docs/linkedin.md)
//      npm run linkedin -- vi      (Vietnamese, writes docs/linkedin.vi.md)
import { readFile, writeFile } from "node:fs/promises";
import { load } from "js-yaml";

const lang = process.argv[2] === "vi" ? "vi" : "en";
const OUT = lang === "en" ? "docs/linkedin.md" : `docs/linkedin.${lang}.md`;

// LinkedIn character limits per field.
const LIMITS = { headline: 220, about: 2600, title: 100, description: 2000 };

const cv = load(await readFile("src/data/cv.yaml", "utf8"));
const t = (l10n) => l10n[lang];

const MONTHS = {
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  vi: Array.from({ length: 12 }, (_, i) => `Th${i + 1}`),
};
const fmtDate = (ym) => {
  if (!ym) return lang === "en" ? "Present" : "Hiện tại";
  const [y, m] = ym.split("-").map(Number);
  return `${MONTHS[lang][m - 1]} ${y}`;
};

const problems = [];
const check = (label, text, limit) => {
  const n = [...text].length;
  if (n > limit) problems.push(`${label}: ${n}/${limit} chars`);
  return `${n}/${limit}`;
};

// One fenced block per field so each is a single copy click.
const field = (label, text, limit) =>
  `**${label}** (${check(label, text, limit)})\n\n\`\`\`text\n${text}\n\`\`\`\n`;

const { meta, hero, stats, about, experience, skills, projects, education, publications, awards, languages } = cv;

const headline = `${t(meta.role)} | ${t(meta.tagline)}`;

const aboutText = [
  t(hero.headline),
  t(hero.summary),
  ...t(about),
  stats.map((s) => `• ${s.value} ${t(s.label)}`).join("\n"),
  t(meta.availability),
  `→ ${meta.links.site}`,
  `✉ ${meta.email}`,
].join("\n\n");

const jobs = experience.map((job) => {
  const description = [
    ...t(job.highlights).map((h) => `• ${h}`),
    "",
    `Stack: ${job.stack.join(", ")}`,
  ].join("\n");
  return [
    `### ${job.company} — ${fmtDate(job.start)} – ${fmtDate(job.end)}`,
    "",
    field("Title", t(job.role), LIMITS.title),
    `- **Company:** ${job.company}`,
    `- **Location:** ${t(job.location)}`,
    `- **Start / end:** ${fmtDate(job.start)} – ${fmtDate(job.end)}`,
    `- **Skills to tag:** ${job.stack.slice(0, 5).join(", ")}`,
    "",
    field("Description", description, LIMITS.description),
  ].join("\n");
});

// LinkedIn shows your top skills first; lead with the core group.
const allSkills = [...new Set(skills.flatMap((g) => g.children))];

const md = [
  `# LinkedIn profile — ${meta.name} (${lang})`,
  "",
  `_Generated from \`src/data/cv.yaml\` by \`npm run linkedin\`. Edit the YAML, not this file._`,
  "",
  "## Intro",
  "",
  field("Headline", headline, LIMITS.headline),
  `- **Location:** ${t(meta.location)}`,
  `- **Website:** ${meta.links.site}`,
  `- **Custom profile URL:** ${meta.links.linkedin}`,
  "",
  "## About",
  "",
  field("About", aboutText, LIMITS.about),
  "## Experience",
  "",
  ...jobs,
  "## Skills",
  "",
  `Top 5 to pin: ${allSkills.slice(0, 5).join(", ")}`,
  "",
  "```text\n" + allSkills.join("\n") + "\n```",
  "",
  "## Education",
  "",
  ...education.map((e) =>
    [
      `### ${e.school} — ${t(e.degree)} (${e.start.slice(0, 4)}–${e.end.slice(0, 4)})`,
      "",
      field("Description", t(e.notes).map((n) => `• ${n}`).join("\n"), LIMITS.description),
    ].join("\n"),
  ),
  "## Projects",
  "",
  ...projects.map((p) => `- **${p.name}** — ${t(p.description)} (${p.repo})`),
  "",
  "## Publications",
  "",
  ...publications.map((p) => `- **${t(p.title)}** — ${p.venue}, ${p.year}. ${p.url}`),
  "",
  "## Honors & awards",
  "",
  ...awards.map((a) => `- **${t(a.title)}** — ${a.issuer}, ${a.year}`),
  "",
  "## Languages",
  "",
  ...languages.map((l) => `- ${t(l.name)} — ${t(l.level)}`),
  "",
].join("\n");

await writeFile(OUT, md);
console.log(`wrote ${OUT}`);
if (problems.length) {
  console.error(`over LinkedIn limits:\n  ${problems.join("\n  ")}`);
  process.exit(1);
}

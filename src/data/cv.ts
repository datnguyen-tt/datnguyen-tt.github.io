import { load } from "js-yaml";
import raw from "./cv.yaml?raw";

export type Lang = "en" | "vi";
export const LANGS = ["en", "vi"] as const satisfies readonly Lang[];
export type L10n<T = string> = Record<Lang, T>;

export const DOMAINS = ["iot", "telecom", "network"] as const;
export type Domain = (typeof DOMAINS)[number];
export const STRATEGIES = [
  "one_for_one",
  "one_for_all",
  "rest_for_one",
] as const;
export type Strategy = (typeof STRATEGIES)[number];

export interface Meta {
  name: string;
  fullName: string;
  initials: string;
  role: L10n;
  tagline: L10n;
  location: L10n;
  email: string;
  links: { github: string; linkedin: string; site: string };
  pdf: string;
  availability: L10n;
}

export interface TerminalLine {
  prompt: string;
  input: string;
  output: string;
}

export interface Hero {
  headline: L10n;
  summary: L10n;
  terminal: TerminalLine[];
}

export interface Stat {
  value: string;
  label: L10n;
}

export interface Job {
  id: string;
  company: string;
  role: L10n;
  location: L10n;
  start: string;
  end: string | null;
  remote: boolean;
  domain: Domain;
  highlights: L10n<string[]>;
  stack: string[];
}

export interface SkillGroup {
  id: string;
  name: L10n;
  strategy: Strategy;
  children: string[];
}

export interface Project {
  name: string;
  repo: string;
  description: L10n;
  tags: string[];
}

export interface Publication {
  title: L10n;
  authors: string;
  venue: string;
  year: number;
  doi: string;
  url: string;
  bibtex: string;
}

export interface Education {
  degree: L10n;
  school: string;
  start: string;
  end: string;
  notes: L10n<string[]>;
}

export interface Award {
  title: L10n;
  issuer: string;
  year: number;
}

export interface Spoken {
  name: L10n;
  level: L10n;
}

export interface CV {
  meta: Meta;
  hero: Hero;
  stats: Stat[];
  about: L10n<string[]>;
  experience: Job[];
  skills: SkillGroup[];
  projects: Project[];
  publications: Publication[];
  education: Education[];
  awards: Award[];
  languages: Spoken[];
}

const REQUIRED = [
  "meta",
  "hero",
  "stats",
  "about",
  "experience",
  "skills",
  "projects",
  "publications",
  "education",
  "awards",
  "languages",
] as const;

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

function fail(path: string, msg: string): never {
  throw new Error(`cv.yaml: ${path} ${msg}`);
}

function checkMonth(path: string, v: unknown, nullable = false): void {
  if (v === null && nullable) return;
  if (typeof v !== "string" || !MONTH.test(v))
    fail(path, `must match YYYY-MM, got ${JSON.stringify(v)}`);
}

function checkEnum(
  path: string,
  v: unknown,
  allowed: readonly string[],
): void {
  if (typeof v !== "string" || !allowed.includes(v))
    fail(path, `must be one of ${allowed.join("|")}, got ${JSON.stringify(v)}`);
}

/** Parse and validate a CV YAML document (shape, enums, dates). */
export function parseCv(source: string): CV {
  const doc = load(source) as Record<string, unknown> | undefined;
  if (!doc || typeof doc !== "object") throw new Error("cv.yaml: empty");
  for (const key of REQUIRED) {
    if (!(key in doc)) throw new Error(`cv.yaml: missing "${key}"`);
  }
  const cv = doc as unknown as CV;
  cv.experience.forEach((j, i) => {
    const p = `experience[${i}] (${j.id})`;
    checkEnum(`${p}.domain`, j.domain, DOMAINS);
    checkMonth(`${p}.start`, j.start);
    checkMonth(`${p}.end`, j.end, true);
  });
  cv.skills.forEach((g, i) =>
    checkEnum(`skills[${i}] (${g.id}).strategy`, g.strategy, STRATEGIES),
  );
  cv.education.forEach((e, i) => {
    checkMonth(`education[${i}].start`, e.start);
    checkMonth(`education[${i}].end`, e.end);
  });
  return cv;
}

export const cv: CV = parseCv(raw);

/** Pick the localized value, falling back to English. */
export function t<T>(field: L10n<T>, lang: Lang): T {
  return field[lang] ?? field.en;
}


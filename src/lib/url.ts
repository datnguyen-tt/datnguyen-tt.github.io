const base = import.meta.env.BASE_URL.replace(/\/$/, "");

/** Prefix a root-relative path ("/vi/") with the configured Astro base. */
export function withBase(path: string): string {
  return `${base}${path}`;
}

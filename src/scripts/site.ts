/* Tiny progressive enhancement: toggles, menu, active nav, hash-preserving
   lang switch, BibTeX copy. No dependencies. */
import { isMotionOn, isVisible, setMotion } from "./motion";

const root = document.documentElement;
const THEME_COLOR = { dark: "#0b0f14", light: "#f6f7f9" } as const;

// --- Theme -----------------------------------------------------------
const themeBtn = document.querySelector<HTMLButtonElement>("[data-theme-toggle]");
const themeMeta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');

function syncTheme(): void {
  const light = root.dataset["theme"] === "light";
  themeMeta?.setAttribute("content", light ? THEME_COLOR.light : THEME_COLOR.dark);
  themeBtn?.setAttribute(
    "aria-label",
    (light ? themeBtn.dataset["toDark"] : themeBtn.dataset["toLight"]) ?? "",
  );
}
themeBtn?.addEventListener("click", () => {
  const next = root.dataset["theme"] === "light" ? "dark" : "light";
  root.dataset["theme"] = next;
  try {
    localStorage.setItem("theme", next);
  } catch {
    /* storage blocked */
  }
  syncTheme();
});
syncTheme();

// --- Motion ----------------------------------------------------------
const motionBtn = document.querySelector<HTMLButtonElement>("[data-motion-toggle]");
const syncMotion = (): void =>
  motionBtn?.setAttribute("aria-pressed", String(isMotionOn()));
motionBtn?.addEventListener("click", () => {
  setMotion(!isMotionOn(), true);
  syncMotion();
});
addEventListener("motionchange", syncMotion);
syncMotion();

// Pause hero animations while off-screen or in a background tab.
const hero = document.getElementById("hero");
if (hero) {
  isVisible(hero, (v) => hero.classList.toggle("is-paused", !v));
}

// --- Compact menu ----------------------------------------------------
const nav = document.querySelector<HTMLElement>("[data-nav]");
const menuBtn = document.querySelector<HTMLButtonElement>("[data-menu-btn]");
function setMenu(open: boolean, refocus = false): void {
  if (!nav || !menuBtn) return;
  nav.toggleAttribute("data-open", open);
  menuBtn.setAttribute("aria-expanded", String(open));
  if (!open && refocus) menuBtn.focus();
}
menuBtn?.addEventListener("click", () =>
  setMenu(menuBtn.getAttribute("aria-expanded") !== "true"),
);
nav?.addEventListener("click", (e) => {
  if ((e.target as Element).closest("a")) setMenu(false);
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && nav?.hasAttribute("data-open")) setMenu(false, true);
});
document.addEventListener("click", (e) => {
  if (nav?.hasAttribute("data-open") && !nav.contains(e.target as Node))
    setMenu(false);
});

// --- Language switch keeps the current hash --------------------------
const langLink = document.querySelector<HTMLAnchorElement>("[data-lang-switch]");
if (langLink) {
  const syncHash = (): void => {
    langLink.hash = location.hash;
  };
  syncHash();
  addEventListener("hashchange", syncHash);
}

// --- Active section highlight ----------------------------------------
const links = new Map<string, HTMLAnchorElement>();
document
  .querySelectorAll<HTMLAnchorElement>('.site-nav a[href^="#"]')
  .forEach((a) => links.set(a.hash.slice(1), a));

if ("IntersectionObserver" in window && links.size) {
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        links.forEach((a, id) => {
          if (id === e.target.id) a.setAttribute("aria-current", "location");
          else a.removeAttribute("aria-current");
        });
      }
    },
    { rootMargin: "-35% 0px -60% 0px" },
  );
  links.forEach((_, id) => {
    const el = document.getElementById(id);
    if (el) io.observe(el);
  });
}

// --- Copy BibTeX -----------------------------------------------------
document
  .querySelectorAll<HTMLButtonElement>("[data-copy-target]")
  .forEach((btn) => {
    const label = btn.querySelector<HTMLElement>("[data-copy-label]");
    const idle = label?.textContent ?? "";
    btn.addEventListener("click", async () => {
      const src = document.getElementById(btn.dataset["copyTarget"] ?? "");
      if (!src || !label) return;
      try {
        await navigator.clipboard.writeText(src.textContent ?? "");
        label.textContent = btn.dataset["done"] ?? idle;
      } catch {
        // Clipboard blocked: open the visible BibTeX so it can be copied.
        src.closest("details")?.setAttribute("open", "");
        return;
      }
      setTimeout(() => (label.textContent = idle), 2000);
    });
  });

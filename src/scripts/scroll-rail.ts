/* Scroll route: a cyan packet travels a rail of section nodes as the page
   scrolls; the "ping(hero@cv)" button routes the packet back to the top.
   The active section comes from the shared scroll-spy in site.ts. */
import { isMotionOn } from "./motion";

const PING = "ping(hero@cv)";
const PONG = "pong hero@cv";
const PONG_MS = 1600;
const HIDE_MS = 300;

const rail = document.querySelector<HTMLElement>("[data-rail]");
const nav = rail?.querySelector<HTMLElement>(".rail__nav");
const packet = rail?.querySelector<HTMLElement>("[data-rail-packet]");
const top = rail?.querySelector<HTMLAnchorElement>("[data-to-top]");
const code = rail?.querySelector<HTMLElement>("[data-to-top-code]");
const live = rail?.querySelector<HTMLElement>("[data-to-top-live]");
const hero = document.getElementById("hero");
const main = document.getElementById("main");

if (rail && nav && packet && top && code && live && hero) {
  const nodes = [...rail.querySelectorAll<HTMLAnchorElement>("[data-rail-node]")];
  const order = nodes.map((n) => n.dataset["railNode"] ?? "");

  // --- Packet position (one write per frame, no layout reads beyond sizes).
  let raf = 0;
  const place = (): void => {
    raf = 0;
    const max = document.documentElement.scrollHeight - innerHeight;
    const p = max > 0 ? Math.min(1, Math.max(0, scrollY / max)) : 0;
    packet.style.setProperty("--p", String(p * nav.clientHeight));
  };
  const schedule = (): void => {
    if (!raf) raf = requestAnimationFrame(place);
  };
  addEventListener("scroll", schedule, { passive: true });
  addEventListener("resize", schedule);
  place();

  // --- Passed nodes: everything up to the active section.
  addEventListener("sectionchange", (e) => {
    const idx = order.indexOf((e as CustomEvent<string>).detail);
    nodes.forEach((n, i) => n.toggleAttribute("data-passed", idx >= 0 && i <= idx));
  });

  // --- Show rail + button once the hero is out of view. While a ping is in
  // flight or its pong is showing (`busy`), the button stays up.
  let heroVisible = true;
  let busy = false;
  let hideTimer = 0;
  const sync = (): void => {
    const away = !heroVisible;
    rail.toggleAttribute("data-on", away);
    clearTimeout(hideTimer);
    if (away) {
      top.hidden = false;
      requestAnimationFrame(() => top.setAttribute("data-show", ""));
      return;
    }
    if (busy) return;
    top.removeAttribute("data-show");
    hideTimer = window.setTimeout(() => {
      if (!top.hasAttribute("data-show")) top.hidden = true;
    }, HIDE_MS);
  };
  new IntersectionObserver((entries) => {
    heroVisible = entries[entries.length - 1]?.isIntersecting ?? true;
    sync();
  }).observe(hero);

  // --- Click: scroll to top, then answer with a pong.
  let resetTimer = 0;
  let pending: (() => void) | null = null;
  const cancel = (): void => {
    pending?.();
    pending = null;
  };
  const settle = (): void => {
    busy = false;
    sync();
  };
  const pong = (): void => {
    main?.focus({ preventScroll: true });
    top.setAttribute("data-state", "pong");
    code.textContent = PONG;
    live.textContent = `${top.dataset["label"] ?? ""}: ${PONG}`;
    busy = true;
    clearTimeout(resetTimer);
    resetTimer = window.setTimeout(() => {
      top.removeAttribute("data-state");
      code.textContent = PING;
      live.textContent = "";
      settle();
    }, PONG_MS);
  };

  top.addEventListener("click", (e) => {
    e.preventDefault();
    cancel();
    if (!isMotionOn() || scrollY <= 2) {
      scrollTo({ top: 0, behavior: "auto" });
      pong();
      return;
    }
    busy = true;
    scrollTo({ top: 0, behavior: "smooth" });
    // Finish on scrollend (with a timeout fallback); a user scroll in between
    // cancels the pong instead of looping until the top is reached.
    const finish = (): void => {
      cancel();
      if (scrollY <= 2) pong();
      else settle();
    };
    const fallback = window.setTimeout(finish, 2000);
    const abort = (): void => {
      cancel();
      settle();
    };
    addEventListener("scrollend", finish, { once: true });
    addEventListener("wheel", abort, { once: true, passive: true });
    addEventListener("touchstart", abort, { once: true, passive: true });
    addEventListener("keydown", abort, { once: true });
    pending = () => {
      clearTimeout(fallback);
      removeEventListener("scrollend", finish);
      removeEventListener("wheel", abort);
      removeEventListener("touchstart", abort);
      removeEventListener("keydown", abort);
    };
  });
}

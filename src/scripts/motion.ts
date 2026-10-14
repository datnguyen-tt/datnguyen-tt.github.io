/* Shared motion helpers for site UI and the signature effects.
   Source of truth: <html data-motion="on|off">, set before first paint by
   the head script (saved choice > prefers-reduced-motion). */
const root = document.documentElement;
const EVENT = "motionchange";
const reduced = matchMedia("(prefers-reduced-motion: reduce)");

function saved(): string | null {
  try {
    return localStorage.getItem("motion");
  } catch {
    return null;
  }
}

/** True unless the user (or the OS, absent a saved choice) turned motion off. */
export function isMotionOn(): boolean {
  return root.dataset["motion"] !== "off";
}

/** Apply a motion state; `persist` stores it as the user's explicit choice. */
export function setMotion(on: boolean, persist = false): void {
  const value = on ? "on" : "off";
  if (root.dataset["motion"] === value && !persist) return;
  root.dataset["motion"] = value;
  if (persist) {
    try {
      localStorage.setItem("motion", value);
    } catch {
      /* storage blocked: applies to this page only */
    }
  }
  window.dispatchEvent(new CustomEvent<boolean>(EVENT, { detail: on }));
}

/** Subscribe to motion on/off changes. Returns an unsubscribe function. */
export function onMotionChange(cb: (on: boolean) => void): () => void {
  const h = (e: Event): void => cb((e as CustomEvent<boolean>).detail);
  window.addEventListener(EVENT, h);
  return () => window.removeEventListener(EVENT, h);
}

// Follow live OS changes while the user has not chosen explicitly.
reduced.addEventListener("change", () => {
  const s = saved();
  if (s !== "on" && s !== "off") setMotion(!reduced.matches);
});

/** Call `cb(true|false)` as `el` becomes (in)visible, counting a hidden tab
    as invisible. Returns a disconnect function. */
export function isVisible(
  el: Element,
  cb: (visible: boolean) => void,
  options?: IntersectionObserverInit,
): () => void {
  let inView = false;
  let last: boolean | undefined;
  const emit = (): void => {
    const v = inView && !document.hidden;
    if (v === last) return;
    last = v;
    cb(v);
  };
  const io = new IntersectionObserver((entries) => {
    inView = entries[entries.length - 1]?.isIntersecting ?? false;
    emit();
  }, options);
  io.observe(el);
  document.addEventListener("visibilitychange", emit);
  return () => {
    io.disconnect();
    document.removeEventListener("visibilitychange", emit);
  };
}

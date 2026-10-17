/**
 * E-04: Commit-log scroll progression on Experience timeline.
 * - Uses SSR-rendered `.log__consumer`, `[data-consumer-offset]`, `[data-consumer-lag]`,
 *   and `.commit-state` badges (zero CLS, zero innerHTML churn — M8).
 * - Early-returns when active index and committed state have not changed.
 */
import { isMotionOn, onMotionChange } from "../scripts/motion";

export function mountCommitLog(mount: HTMLElement): void {
  if (mount.dataset["fxReady"] === "true") return;

  const entries = Array.from(mount.querySelectorAll<HTMLElement>(".entry"));
  if (entries.length === 0) return;

  const offsetValueEl = mount.querySelector<HTMLElement>("[data-consumer-offset]");
  const lagValueEl = mount.querySelector<HTMLElement>("[data-consumer-lag]");
  const stateBadges = entries.map((entry) =>
    entry.querySelector<HTMLElement>(".commit-state"),
  );

  let rafPending = false;
  let lastActiveIdx = -1;
  let lastAllCommitted = false;

  function applyState(activeIdx: number, allCommitted: boolean): void {
    if (activeIdx === lastActiveIdx && allCommitted === lastAllCommitted) {
      return;
    }
    lastActiveIdx = activeIdx;
    lastAllCommitted = allCommitted;

    const total = entries.length;
    entries.forEach((entry, idx) => {
      const badge = stateBadges[idx];
      entry.classList.remove("is-committed", "is-active", "is-pending");

      if (allCommitted || idx < activeIdx) {
        entry.classList.add("is-committed");
        if (badge) badge.textContent = "committed";
      } else if (idx === activeIdx) {
        entry.classList.add("is-active");
        if (badge) badge.textContent = "consuming";
      } else {
        entry.classList.add("is-pending");
        if (badge) badge.textContent = "queued";
      }
    });

    const currentEntry = entries[Math.min(activeIdx, total - 1)];
    const currentOffset = currentEntry?.dataset["offset"] ?? "0";
    const lag = allCommitted ? 0 : Math.max(0, total - 1 - activeIdx);

    if (offsetValueEl) offsetValueEl.textContent = currentOffset;
    if (lagValueEl) lagValueEl.textContent = String(lag);
  }

  function updateFromScroll(): void {
    rafPending = false;
    if (!isMotionOn()) {
      applyState(entries.length - 1, true);
      return;
    }

    const viewportLine = window.innerHeight * 0.45;
    let activeIdx = 0;
    for (let i = 0; i < entries.length; i++) {
      const rect = entries[i]!.getBoundingClientRect();
      if (rect.top <= viewportLine) {
        activeIdx = i;
      }
    }
    applyState(activeIdx, false);
  }

  function onScroll(): void {
    if (!isMotionOn() || rafPending) return;
    rafPending = true;
    requestAnimationFrame(updateFromScroll);
  }

  window.addEventListener("scroll", onScroll, { passive: true });
  onMotionChange((on) => {
    if (!on) {
      applyState(entries.length - 1, true);
    } else {
      lastActiveIdx = -1;
      updateFromScroll();
    }
  });

  updateFromScroll();
  mount.dataset["fxReady"] = "true";
}

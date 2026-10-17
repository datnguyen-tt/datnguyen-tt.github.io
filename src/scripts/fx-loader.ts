/**
 * Tiny IntersectionObserver loader that lazily imports each signature effect
 * chunk only when its `[data-effect]` mount nears the viewport (~200px).
 * Disconnects the IntersectionObserver once all mounts have been loaded (L14).
 */
const root = document.documentElement;

type MountFn = (el: HTMLElement) => void;

const LOADERS: Record<string, () => Promise<MountFn>> = {
  "beam-cluster": () =>
    import("../fx/beam-cluster").then((m) => m.mountBeamCluster),
  "terminal-typing": () =>
    import("../fx/terminal-typing").then((m) => m.mountTerminalTyping),
  "mailbox-fifo": () =>
    import("../fx/mailbox-fifo").then((m) => m.mountMailboxFifo),
  "commit-log": () =>
    import("../fx/commit-log").then((m) => m.mountCommitLog),
  "supervision-tree": () =>
    import("../fx/supervision-tree").then((m) => m.mountSupervisionTree),
  "send-message": () =>
    import("../fx/send-message").then((m) => m.mountSendMessage),
};

if (!root.classList.contains("print-mode")) {
  const mounts = document.querySelectorAll<HTMLElement>("[data-effect]");
  let remaining = mounts.length;

  const loadEffect = (el: HTMLElement): void => {
    if (el.dataset["fxLoaded"]) return;
    el.dataset["fxLoaded"] = "true";
    remaining = Math.max(0, remaining - 1);
    const key = el.dataset["effect"] ?? "";
    const loader = LOADERS[key];
    if (!loader) return;
    void loader().then((mountFn) => mountFn(el));
  };

  if ("IntersectionObserver" in window && remaining > 0) {
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          io.unobserve(entry.target);
          loadEffect(entry.target as HTMLElement);
        }
        if (remaining === 0) {
          io.disconnect();
        }
      },
      { rootMargin: "200px 0px" },
    );
    mounts.forEach((el) => io.observe(el));
  } else {
    mounts.forEach(loadEffect);
  }
}

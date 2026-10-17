/**
 * E-05: Interactive Supervision Tree in Skills section.
 * - Uses the single global segmented strategy control (`input[name="sup-global-strategy"]`):
 *   `as_designed` uses each group's `data-strategy`; other values override all groups.
 * - Binds click handlers to `.worker__btn` inside each `<li class="worker">` (H2 axe fix).
 * - Holds crashed workers red ~900ms, then restarts the restartSet staggered in
 *   start order (`i * 120ms`) so strategies are visibly distinct (Architect #3).
 * - Handles supervisor escalation when max restart intensity is exceeded (M5).
 */
import { Supervisor, type Strategy } from "./engine/supervisor";

type GlobalStrategyMode = "as_designed" | Strategy;

interface GroupController {
  groupEl: HTMLElement;
  groupId: string;
  designedStrategy: Strategy;
  sup: Supervisor;
  workerMap: Map<string, HTMLElement>;
  timers: ReturnType<typeof setTimeout>[];
}

export function mountSupervisionTree(mount: HTMLElement): void {
  if (mount.dataset["fxReady"] === "true") return;

  const restartedTpl =
    mount.dataset["restartedTpl"] ?? "Supervisor restarted {n} skills ({strategy})";
  const escalatedMsg =
    mount.dataset["escalated"] ??
    "max restart intensity reached — supervisor shut down, parent restarts it";

  const primaryOut = mount.querySelector<HTMLElement>("[data-sup-primary]");
  const subOut = mount.querySelector<HTMLElement>("[data-sup-sub]");
  const defaultPrimaryText = primaryOut?.textContent ?? "";
  const defaultSubText = subOut?.textContent ?? "";

  const groups = Array.from(mount.querySelectorAll<HTMLElement>(".group"));
  const controllers: GroupController[] = [];
  let globalMode: GlobalStrategyMode = "as_designed";

  function clearGroupTimers(ctrl: GroupController): void {
    while (ctrl.timers.length > 0) {
      const t = ctrl.timers.pop();
      if (t !== undefined) clearTimeout(t);
    }
  }

  groups.forEach((groupEl, gIdx) => {
    const groupId = groupEl.dataset["group"] ?? `sup_${gIdx}`;
    const designedStrategy =
      (groupEl.dataset["strategy"] as Strategy | undefined) ?? "one_for_one";
    const workerItems = Array.from(
      groupEl.querySelectorAll<HTMLElement>(".workers > .worker"),
    );
    const workerIds: string[] = [];
    const workerMap = new Map<string, HTMLElement>();

    workerItems.forEach((li, wIdx) => {
      const btn = li.querySelector<HTMLButtonElement>(".worker__btn");
      const rawName = (btn?.textContent ?? li.textContent ?? "").trim();
      const wId = li.dataset["worker"] ?? (rawName || `${groupId}_${wIdx}`);
      workerIds.push(wId);
      workerMap.set(wId, li);
    });

    const sup = new Supervisor({
      id: groupId,
      strategy: designedStrategy,
      children: workerIds,
      restartDelayMs: 900,
      maxRestarts: 4,
      periodMs: 4500,
    });

    const ctrl: GroupController = {
      groupEl,
      groupId,
      designedStrategy,
      sup,
      workerMap,
      timers: [],
    };
    controllers.push(ctrl);

    workerItems.forEach((li, wIdx) => {
      const wId = workerIds[wIdx]!;
      const btn = li.querySelector<HTMLButtonElement>(".worker__btn") ?? li;
      btn.addEventListener("click", () => triggerCrash(ctrl, wId));
    });
  });

  // Wire global strategy segmented control
  const radios = Array.from(
    mount.querySelectorAll<HTMLInputElement>('input[name="sup-global-strategy"]'),
  );
  radios.forEach((radio) => {
    radio.addEventListener("change", () => {
      if (!radio.checked) return;
      globalMode = (radio.value as GlobalStrategyMode) || "as_designed";
      for (const ctrl of controllers) {
        const nextStrat =
          globalMode === "as_designed" ? ctrl.designedStrategy : globalMode;
        ctrl.sup.setStrategy(nextStrat);
      }
      mount.dataset["activeStrategyMode"] = globalMode;
    });
  });

  function triggerCrash(ctrl: GroupController, wId: string): void {
    const now = performance.now();
    const effectiveStrategy =
      globalMode === "as_designed" ? ctrl.designedStrategy : globalMode;
    ctrl.sup.setStrategy(effectiveStrategy);

    const report = ctrl.sup.crash(wId, now);
    if (report.restartSet.length === 0) return;

    clearGroupTimers(ctrl);

    // M5: Escalation handling
    if (report.escalated) {
      mount.dataset["lastSupervisorReport"] = wId;
      mount.dataset["escalatedState"] = "true";
      if (primaryOut) primaryOut.textContent = escalatedMsg;
      if (subOut) {
        subOut.textContent = `=SUPERVISOR REPORT= supervisor: ${ctrl.groupId}, reason: reached_max_restart_intensity`;
      }
      for (const [, el] of ctrl.workerMap) {
        el.classList.remove("is-restarted");
        el.classList.add("is-crashed");
      }
      const escTimer = setTimeout(() => {
        ctrl.sup.reset(performance.now());
        mount.dataset["escalatedState"] = "false";
        for (const [, el] of ctrl.workerMap) {
          el.classList.remove("is-crashed");
          el.classList.add("is-restarted");
        }
        if (primaryOut) primaryOut.textContent = defaultPrimaryText;
        if (subOut) subOut.textContent = defaultSubText;
        const cleanTimer = setTimeout(() => {
          for (const [, el] of ctrl.workerMap) {
            el.classList.remove("is-restarted");
          }
        }, 700);
        ctrl.timers.push(cleanTimer);
      }, 1200);
      ctrl.timers.push(escTimer);
      return;
    }

    // Standard crash: hold crashed workers red for ~900ms, then stagger restarts in start order
    for (const id of report.restartSet) {
      const el = ctrl.workerMap.get(id);
      if (el) {
        el.classList.remove("is-restarted");
        el.classList.add("is-crashed");
      }
    }

    const primaryText = restartedTpl
      .replace("{n}", String(report.restartSet.length))
      .replace("{strategy}", report.strategy);
    if (primaryOut) primaryOut.textContent = primaryText;
    if (subOut) {
      subOut.textContent = `=SUPERVISOR REPORT= sup: ${ctrl.groupId}, child: ${wId}, strategy: ${report.strategy}, restarted: [${report.restartSet.join(", ")}]`;
    }
    mount.dataset["lastSupervisorReport"] = wId;

    const baseHoldTimer = setTimeout(() => {
      ctrl.sup.tick(performance.now());
      report.restartSet.forEach((id, i) => {
        const staggerTimer = setTimeout(() => {
          const el = ctrl.workerMap.get(id);
          if (!el) return;
          el.classList.remove("is-crashed");
          el.classList.add("is-restarted");
          const clearTimer = setTimeout(() => {
            el.classList.remove("is-restarted");
          }, 680);
          ctrl.timers.push(clearTimer);
        }, i * 120);
        ctrl.timers.push(staggerTimer);
      });
    }, 900);
    ctrl.timers.push(baseHoldTimer);
  }

  mount.dataset["fxReady"] = "true";
}

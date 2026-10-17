import { describe, expect, it } from "vitest";
import {
  buildFullMeshEdges,
  findMeshEdgeIndex,
  getActiveNodeSpecs,
  planRoute,
  rectsOverlap,
  selectRelayNode,
  type NodeLifecycle,
} from "../../src/fx/engine/mesh-router";

describe("mesh-router engine (E-01 v2)", () => {
  it("selects 6 BEAM nodes on desktop and 4 compact nodes on mobile", () => {
    const desktop = getActiveNodeSpecs(false);
    const mobile = getActiveNodeSpecs(true);
    expect(desktop.map((n) => n.id)).toEqual([
      "sbg1@sig-01",
      "nso1@netauto",
      "edge1@lora-gw",
      "mnesia1@store",
      "iot1@telemetry",
      "ivr1@msg-gw",
    ]);
    expect(mobile.map((n) => n.id)).toEqual([
      "sbg1@sig-01",
      "nso1@netauto",
      "mnesia1@store",
      "iot1@telemetry",
    ]);
  });

  it("builds n*(n-1)/2 full-mesh links and finds undirected edges", () => {
    const desktopEdges = buildFullMeshEdges(6);
    expect(desktopEdges).toHaveLength((6 * 5) / 2); // 15

    const mobileEdges = buildFullMeshEdges(4);
    expect(mobileEdges).toHaveLength((4 * 3) / 2); // 6

    const idx = findMeshEdgeIndex(desktopEdges, 4, 1);
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(desktopEdges[idx]?.a).toBe(1);
    expect(desktopEdges[idx]?.b).toBe(4);
  });

  it("plans direct route when all nodes are up", () => {
    const states: NodeLifecycle[] = ["up", "up", "up", "up", "up", "up"];
    const route = planRoute(0, 3, states);
    expect(route).toEqual({
      fromIdx: 0,
      toIdx: 3,
      viaIdx: null,
      rerouted: false,
      avoidedIdx: null,
    });
  });

  it("reroutes traffic away from a downed destination node via a healthy relay", () => {
    const states: NodeLifecycle[] = ["up", "down", "up", "up", "up", "up"];
    const route = planRoute(0, 1, states, 1);
    expect(route).not.toBeNull();
    expect(route?.rerouted).toBe(true);
    expect(route?.avoidedIdx).toBe(1);
    expect(route?.toIdx).not.toBe(1);
    expect(route?.viaIdx).toBe(2);
  });

  it("routes via a 2-hop failover relay when an active nodedown exists in cluster", () => {
    const states: NodeLifecycle[] = ["up", "up", "down", "up", "up", "up"];
    const relay = selectRelayNode(0, 4, 2, states);
    expect(relay).toBe(3);

    const route = planRoute(0, 4, states, 2);
    expect(route).toEqual({
      fromIdx: 0,
      toIdx: 4,
      viaIdx: 3,
      rerouted: true,
      avoidedIdx: 2,
    });
  });

  it("detects axis-aligned rectangle overlaps accurately with padding", () => {
    const copyRect = { left: 64, top: 96, right: 640, bottom: 520 };
    const safeNode = { left: 80, top: 16, right: 200, bottom: 80 };
    const overlappingNode = { left: 580, top: 490, right: 700, bottom: 554 };

    expect(rectsOverlap(safeNode, copyRect, 8)).toBe(false);
    expect(rectsOverlap(overlappingNode, copyRect, 8)).toBe(true);
  });
});

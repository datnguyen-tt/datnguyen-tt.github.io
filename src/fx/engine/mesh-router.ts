/**
 * Pure topology, protocol catalog, and failover/rerouting logic for E-01 v2
 * ("Fault-tolerant BEAM mesh"). Zero DOM or Canvas dependencies.
 */
import type { Strategy } from "./supervisor";

export type ProtocolId = "SIP" | "Diameter" | "NETCONF" | "MQTT" | "Erlang";

export type NodeLifecycle = "up" | "down" | "restarting";

export interface ProtocolSpec {
  id: ProtocolId;
  labels: readonly string[];
}

export interface BeamNodeSpec {
  id: string;
  shortName: string;
  supId: string;
  role: string;
  strategy: Strategy;
  workers: readonly string[];
  protocol: ProtocolId;
  /** Overrides PROTOCOL_SPECS labels for this node's outbound packets. */
  packetLabels?: readonly string[];
  mobileIncluded: boolean;
}

export interface MeshEdge {
  id: string;
  a: number;
  b: number;
  pulseUntilMs: number;
  rerouteUntilMs: number;
}

export interface RoutePlan {
  fromIdx: number;
  toIdx: number;
  viaIdx: number | null;
  rerouted: boolean;
  avoidedIdx: number | null;
}

export interface BoxRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export const PROTOCOL_SPECS: Record<ProtocolId, ProtocolSpec> = {
  SIP: { id: "SIP", labels: ["INVITE", "200 OK", "ACK"] },
  Diameter: { id: "Diameter", labels: ["CCR", "CCA", "DWR"] },
  NETCONF: {
    id: "NETCONF",
    labels: ["<rpc/>", "<edit-config/>", "<commit/>"],
  },
  MQTT: { id: "MQTT", labels: ["PUBLISH", "PUBACK", "SUB +/#"] },
  Erlang: { id: "Erlang", labels: ["{call, …}", "{cast, …}", "{ok, state}"] },
};

export const BEAM_NODE_SPECS: readonly BeamNodeSpec[] = [
  {
    id: "sbg1@sig-01",
    shortName: "sbg1@sig-01",
    supId: "sbg_sup",
    role: "SIP · Diameter · H.248",
    strategy: "one_for_one",
    workers: ["sip_worker", "diam_ccr", "h248_ctrl", "rtp_proxy"],
    protocol: "SIP",
    packetLabels: ["INVITE", "CCR"],
    mobileIncluded: true,
  },
  {
    id: "nso1@netauto",
    shortName: "nso1@netauto",
    supId: "nso_sup",
    role: "NETCONF · YANG · CDB",
    strategy: "rest_for_one",
    workers: ["netconf_d", "yang_val", "cdb_tx", "ned_pool"],
    protocol: "NETCONF",
    packetLabels: ["<rpc/>", "<edit-config/>"],
    mobileIncluded: true,
  },
  {
    id: "edge1@lora-gw",
    shortName: "edge1@lora-gw",
    supId: "edge_sup",
    role: "TLS 1.3 · LoRaWAN",
    strategy: "one_for_one",
    workers: ["tls_hand", "lorawan_join", "lora_pkt"],
    protocol: "MQTT",
    packetLabels: ["JOIN", "PUBLISH"],
    mobileIncluded: false,
  },
  {
    id: "mnesia1@store",
    shortName: "mnesia1@store",
    supId: "mnesia_sup",
    role: "Mnesia · ETS · disc_copies",
    strategy: "rest_for_one",
    workers: ["tm_coord", "ets_cache", "disc_copies"],
    protocol: "Erlang",
    packetLabels: ["{write,…}", "{atomic,ok}"],
    mobileIncluded: true,
  },
  {
    id: "iot1@telemetry",
    shortName: "iot1@telemetry",
    supId: "iot_sup",
    role: "MQTT · CoAP · QoS 1",
    strategy: "one_for_one",
    workers: ["mqtt_br", "coap_ep", "qos_flow", "ts_writer"],
    protocol: "MQTT",
    packetLabels: ["PUBLISH", "PUBACK"],
    mobileIncluded: true,
  },
  {
    id: "ivr1@msg-gw",
    shortName: "ivr1@msg-gw",
    supId: "ivr_sup",
    role: "USSD · SMPP · SIP/RTP",
    strategy: "one_for_all",
    workers: ["ussd_sess", "smpp_mt", "sip_rtp"],
    protocol: "SIP",
    packetLabels: ["SUBMIT_SM", "INVITE"],
    mobileIncluded: false,
  },
];

/** Select the 6 desktop specs or 4 compact mobile specs. */
export function getActiveNodeSpecs(compact: boolean): readonly BeamNodeSpec[] {
  return compact
    ? BEAM_NODE_SPECS.filter((s) => s.mobileIncluded)
    : BEAM_NODE_SPECS;
}

/** Generate full-mesh undirected edges: n * (n - 1) / 2 links. */
export function buildFullMeshEdges(nodeCount: number): MeshEdge[] {
  const edges: MeshEdge[] = [];
  for (let a = 0; a < nodeCount; a++) {
    for (let b = a + 1; b < nodeCount; b++) {
      edges.push({
        id: `${a}-${b}`,
        a,
        b,
        pulseUntilMs: 0,
        rerouteUntilMs: 0,
      });
    }
  }
  return edges;
}

/** Find edge index connecting `u` and `v` in an undirected mesh list. */
export function findMeshEdgeIndex(
  edges: readonly MeshEdge[],
  u: number,
  v: number,
): number {
  const lo = Math.min(u, v);
  const hi = Math.max(u, v);
  for (let i = 0; i < edges.length; i++) {
    const e = edges[i]!;
    if (e.a === lo && e.b === hi) return i;
  }
  return -1;
}

/** Pick a healthy relay node distinct from `fromIdx`, `toIdx`, and `downIdx`. */
export function selectRelayNode(
  fromIdx: number,
  toIdx: number,
  downIdx: number,
  states: readonly NodeLifecycle[],
): number | null {
  const n = states.length;
  for (let offset = 1; offset <= n; offset++) {
    const cand = (downIdx + offset) % n;
    if (
      cand !== fromIdx &&
      cand !== toIdx &&
      cand !== downIdx &&
      states[cand] !== "down"
    ) {
      return cand;
    }
  }
  return null;
}

/**
 * Plan a route from `fromIdx` to `toIdx`.
 * - If `toIdx` is `down`, reroutes via a healthy relay node to an available peer.
 * - If another node `activeDownIdx` is currently `down`, routes via a 2-hop relay
 *   to demonstrate cluster failover traffic bypassing the downed node.
 */
export function planRoute(
  fromIdx: number,
  toIdx: number,
  states: readonly NodeLifecycle[],
  activeDownIdx = -1,
): RoutePlan | null {
  if (
    fromIdx < 0 ||
    toIdx < 0 ||
    fromIdx >= states.length ||
    toIdx >= states.length ||
    fromIdx === toIdx ||
    states[fromIdx] === "down"
  ) {
    return null;
  }

  // Direct target is down: failover to another healthy node via a relay
  if (states[toIdx] === "down") {
    const relay = selectRelayNode(fromIdx, toIdx, toIdx, states);
    if (relay === null) return null;
    const altDest = selectRelayNode(fromIdx, relay, toIdx, states) ?? relay;
    return {
      fromIdx,
      toIdx: altDest,
      viaIdx: altDest !== relay ? relay : null,
      rerouted: true,
      avoidedIdx: toIdx,
    };
  }

  // Another node in the cluster is down: route via a healthy relay to show failover path
  if (
    activeDownIdx >= 0 &&
    activeDownIdx < states.length &&
    states[activeDownIdx] === "down"
  ) {
    const relay = selectRelayNode(fromIdx, toIdx, activeDownIdx, states);
    if (relay !== null) {
      return {
        fromIdx,
        toIdx,
        viaIdx: relay,
        rerouted: true,
        avoidedIdx: activeDownIdx,
      };
    }
  }

  return {
    fromIdx,
    toIdx,
    viaIdx: null,
    rerouted: false,
    avoidedIdx: null,
  };
}

/** Return true if two axis-aligned rects overlap (with optional padding). */
export function rectsOverlap(a: BoxRect, b: BoxRect, pad = 0): boolean {
  return !(
    a.right + pad <= b.left ||
    a.left - pad >= b.right ||
    a.bottom + pad <= b.top ||
    a.top - pad >= b.bottom
  );
}

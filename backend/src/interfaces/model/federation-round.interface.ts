export const FEDERATED_ROUND_PHASES = [
  "starting",
  "collecting",
  "broadcasting",
  "completed",
  "partial",
  "failed",
] as const;

export type FederatedRoundPhase = (typeof FEDERATED_ROUND_PHASES)[number];

export const FEDERATED_NODE_PHASES = [
  "preparing",
  "submitted",
  "received",
  "broadcasting",
  "applied",
  "synced",
  "failed",
] as const;

export type FederatedNodePhase = (typeof FEDERATED_NODE_PHASES)[number];

export interface FederatedRoundNodeSnapshot {
  node_id: string;
  hospital_name: string;
  status: FederatedNodePhase;
  last_event_at: string | null;
  events: Array<{
    status: FederatedNodePhase;
    timestamp: string;
    details?: string;
  }>;
}

export interface FederatedRoundSnapshot {
  round_id: string;
  round: number;
  status: FederatedRoundPhase;
  created_at: string;
  updated_at: string;
  target_node_ids: string[];
  nodes: FederatedRoundNodeSnapshot[];
  ready_nodes: number;
  synced_nodes: number;
}

export interface FederatedRoundStartInput {
  targetNodeIds?: string[];
}

export interface FederatedRoundCallbackInput {
  nodeId: string;
  update?: unknown;
  metrics?: Record<string, unknown>;
  notes?: string;
}

export interface FederatedRoundBroadcastInput {
  nodeIds?: string[];
  weights?: unknown;
  notes?: string;
}

export interface LocalTrainingStartInput {
  config?: Record<string, unknown>;
}

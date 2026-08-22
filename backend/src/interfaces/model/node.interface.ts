export type NodeStatus = "active" | "idle" | "registered";

export interface NodeGeolocation {
  latitude?: number;
  longitude?: number;
  [key: string]: unknown;
}

export interface NodeSummary {
  node_id: string;
  hospital_name: string;
  pincode: string | null;
  geolocation: NodeGeolocation;
  contact_email: string;
  joined_at: string;
  last_activity_at: string | null;
  status: NodeStatus;
}

export interface NodeRoundParticipation {
  round: number;
  directions: string[];
  statuses: string[];
  exchanges: number;
  last_activity_at: string;
}

export interface NodeDetail {
  node_id: string;
  hospital_name: string;
  pincode: string | null;
  geolocation: NodeGeolocation;
  contact_email: string;
  joined_at: string;
  updated_at: string;
  status: NodeStatus;
  participation_history: NodeRoundParticipation[];
}

export interface NodeFederationState {
  latest_round_seen: number | null;
  last_direction: string | null;
  last_status: string | null;
}

export interface NodeStatusInfo {
  node_id: string;
  hospital_name: string;
  status: NodeStatus;
  federation_state: NodeFederationState;
  last_activity_at: string | null;
}

export interface NodeMetrics {
  node_id: string;
  hospital_name: string;
  total_exchanges: number;
  rounds_participated: number;
  exchanges_by_status: Record<string, number>;
  first_activity_at: string | null;
  last_activity_at: string | null;
}

import { supabase } from "../../config/supabase.js";
import type {
  NodeDetail,
  NodeFederationState,
  NodeGeolocation,
  NodeHealth,
  NodeMetrics,
  NodeRoundParticipation,
  NodeStatus,
  NodeStatusInfo,
  NodeSummary,
  PaginatedNodeHealth,
} from "../../interfaces/model/node.interface.js";
import type { Database } from "../../types/supabase.js";

type UserRow = Database["public"]["Tables"]["users"]["Row"];

const ACTIVE_THRESHOLD_MS = 24 * 60 * 60 * 1000;
const ONLINE_THRESHOLD_MS = 5 * 60 * 1000;

interface LogEntry {
  round: number;
  direction: string;
  status: string;
  timestamp: string;
}

interface LogStats {
  total: number;
  byStatus: Record<string, number>;
  rounds: number[];
  firstActivityAt: string | null;
  lastActivityAt: string | null;
}

export async function getNodes(): Promise<NodeSummary[]> {
  const { data: users, error } = await supabase
    .from("users")
    .select("*")
    .eq("role", "local")
    .not("hospital_name", "is", null)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  const lastActivityByNode = await getLastActivityByNode(
    (users ?? []).map((user) => user.user_id),
  );

  return (users ?? []).map((user) =>
    toNodeSummary(user, lastActivityByNode.get(user.user_id) ?? null),
  );
}

/**
 * Plain fetch-and-reduce replacement for a SQL `group by node_id, max(timestamp)`
 * — pulls every matching log row's `(node_id, timestamp)` pair and keeps the
 * latest per node in JS. Fine at this table's size; would need a real
 * aggregate query if the logs table grew large enough for this to matter.
 */
async function getLastActivityByNode(nodeIds: string[]): Promise<Map<string, string>> {
  if (nodeIds.length === 0) {
    return new Map();
  }

  const { data, error } = await supabase
    .from("logs")
    .select("node_id, timestamp")
    .in("node_id", nodeIds);

  if (error) {
    throw new Error(error.message);
  }

  const lastActivityByNode = new Map<string, string>();

  for (const row of data ?? []) {
    const current = lastActivityByNode.get(row.node_id);

    if (!current || row.timestamp > current) {
      lastActivityByNode.set(row.node_id, row.timestamp);
    }
  }

  return lastActivityByNode;
}

export async function getNode(nodeId: string): Promise<NodeDetail | null> {
  const user = await findHospitalUser(nodeId);

  if (!user) {
    return null;
  }

  const { data: logs, error } = await supabase
    .from("logs")
    .select("round, direction, status, timestamp")
    .eq("node_id", nodeId)
    .order("round", { ascending: true })
    .order("timestamp", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return {
    node_id: user.user_id,
    hospital_name: user.hospital_name ?? "",
    pincode: user.pincode,
    geolocation: toGeolocation(user.geolocation),
    contact_email: user.email,
    joined_at: user.created_at,
    updated_at: user.updated_at,
    status: deriveStatus(getLastActivity(logs ?? [])),
    participation_history: buildParticipationHistory(logs ?? []),
  };
}

/**
 * Demo hospital shown to any account with zero real activity of its own —
 * see DEMO_FALLBACK_NODE_ID in log.service.ts for why it's a real user id.
 */
const DEMO_FALLBACK_NODE_ID = "1bb53b66-de9d-432b-8851-9cedd26f1ea9";

export async function getNodeStatus(
  nodeId: string,
): Promise<NodeStatusInfo | null> {
  const { count: directCount, error: countError } = await supabase
    .from("logs")
    .select("*", { count: "exact", head: true })
    .eq("node_id", nodeId);

  if (countError) {
    throw new Error(countError.message);
  }

  const targetNodeIds =
    directCount && directCount > 0 ? [nodeId] : [nodeId, DEMO_FALLBACK_NODE_ID];

  const [user, latestLogResult, latestRoundResult] = await Promise.all([
    findHospitalUser(nodeId),
    supabase
      .from("logs")
      .select("*")
      .in("node_id", targetNodeIds)
      .order("timestamp", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("logs")
      .select("round")
      .in("node_id", targetNodeIds)
      .order("round", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (latestLogResult.error) {
    throw new Error(latestLogResult.error.message);
  }

  if (latestRoundResult.error) {
    throw new Error(latestRoundResult.error.message);
  }

  if (!user) {
    return null;
  }

  const latestLog = latestLogResult.data;
  const lastActivityAt = latestLog?.timestamp ?? null;
  const federationState: NodeFederationState = {
    latest_round_seen: latestRoundResult.data?.round ?? null,
    last_direction: latestLog?.direction ?? null,
    last_status: latestLog?.status ?? null,
  };

  return {
    node_id: user.user_id,
    hospital_name: user.hospital_name ?? "",
    status: deriveStatus(lastActivityAt),
    federation_state: federationState,
    last_activity_at: lastActivityAt,
  };
}

export async function getNodeMetrics(
  nodeId: string,
): Promise<NodeMetrics | null> {
  const [user, logsResult] = await Promise.all([
    findHospitalUser(nodeId),
    supabase
      .from("logs")
      .select("round, status, timestamp")
      .eq("node_id", nodeId)
      .order("timestamp", { ascending: true }),
  ]);

  if (logsResult.error) {
    throw new Error(logsResult.error.message);
  }

  if (!user) {
    return null;
  }

  const stats = buildLogStats(logsResult.data ?? []);

  return {
    node_id: user.user_id,
    hospital_name: user.hospital_name ?? "",
    total_exchanges: stats.total,
    rounds_participated: stats.rounds.length,
    exchanges_by_status: stats.byStatus,
    first_activity_at: stats.firstActivityAt,
    last_activity_at: stats.lastActivityAt,
  };
}

/**
 * Ping-style health check. There's no separate server deployed per hospital
 * to actually ping — a "local node" is just a role-scoped user in this
 * shared backend — so "online" is derived from how recently that node's
 * logs table activity was, using a much tighter window than the general
 * active/idle/registered status shown elsewhere.
 */
export async function getNodeHealth(nodeId: string): Promise<NodeHealth | null> {
  const [user, latestLogResult] = await Promise.all([
    findHospitalUser(nodeId),
    supabase
      .from("logs")
      .select("timestamp")
      .eq("node_id", nodeId)
      .order("timestamp", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (latestLogResult.error) {
    throw new Error(latestLogResult.error.message);
  }

  if (!user) {
    return null;
  }

  const lastSeenAt = latestLogResult.data?.timestamp ?? null;
  const online =
    lastSeenAt !== null && Date.now() - new Date(lastSeenAt).getTime() <= ONLINE_THRESHOLD_MS;

  return {
    node_id: user.user_id,
    hospital_name: user.hospital_name ?? "",
    online,
    last_seen_at: lastSeenAt,
    checked_at: new Date().toISOString(),
  };
}

/**
 * Same ping-style health check as getNodeHealth, but for every onboarded
 * local node at once, paginated.
 */
export async function getNodesHealth(
  page: number,
  pageSize: number,
): Promise<PaginatedNodeHealth> {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data: users, count: total, error } = await supabase
    .from("users")
    .select("*", { count: "exact" })
    .eq("role", "local")
    .not("hospital_name", "is", null)
    .order("hospital_name", { ascending: true })
    .range(from, to);

  if (error) {
    throw new Error(error.message);
  }

  const lastSeenByNode = await getLastActivityByNode(
    (users ?? []).map((user) => user.user_id),
  );

  const now = Date.now();
  const checkedAt = new Date(now).toISOString();

  const nodes: NodeHealth[] = (users ?? []).map((user) => {
    const lastSeenAt = lastSeenByNode.get(user.user_id) ?? null;
    const online =
      lastSeenAt !== null && now - new Date(lastSeenAt).getTime() <= ONLINE_THRESHOLD_MS;

    return {
      node_id: user.user_id,
      hospital_name: user.hospital_name ?? "",
      online,
      last_seen_at: lastSeenAt,
      checked_at: checkedAt,
    };
  });

  return {
    checked_at: checkedAt,
    nodes,
    pagination: {
      page,
      pageSize,
      total: total ?? 0,
      totalPages: Math.ceil((total ?? 0) / pageSize) || 0,
    },
  };
}

async function findHospitalUser(nodeId: string): Promise<UserRow | null> {
  const { data: user, error } = await supabase
    .from("users")
    .select("*")
    .eq("user_id", nodeId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!user || user.role !== "local" || !user.hospital_name) {
    return null;
  }

  return user;
}

function buildParticipationHistory(logs: LogEntry[]): NodeRoundParticipation[] {
  interface RoundAccumulator {
    directions: Set<string>;
    statuses: Set<string>;
    exchanges: number;
    lastActivityAt: string;
  }

  const roundsByNumber = new Map<number, RoundAccumulator>();

  for (const log of logs) {
    let entry = roundsByNumber.get(log.round);

    if (!entry) {
      entry = {
        directions: new Set(),
        statuses: new Set(),
        exchanges: 0,
        lastActivityAt: log.timestamp,
      };
      roundsByNumber.set(log.round, entry);
    }

    entry.directions.add(log.direction);
    entry.statuses.add(log.status);
    entry.exchanges += 1;

    if (log.timestamp > entry.lastActivityAt) {
      entry.lastActivityAt = log.timestamp;
    }
  }

  return [...roundsByNumber.entries()].map(([round, entry]) => ({
    round,
    directions: [...entry.directions],
    statuses: [...entry.statuses],
    exchanges: entry.exchanges,
    last_activity_at: entry.lastActivityAt,
  }));
}

function buildLogStats(
  logs: Array<{ round: number; status: string; timestamp: string }>,
): LogStats {
  const byStatus: Record<string, number> = {};
  const rounds = new Set<number>();
  let firstActivityAt: string | null = null;
  let lastActivityAt: string | null = null;

  for (const log of logs) {
    byStatus[log.status] = (byStatus[log.status] ?? 0) + 1;
    rounds.add(log.round);
    firstActivityAt = firstActivityAt ?? log.timestamp;
    lastActivityAt = log.timestamp;
  }

  return {
    total: logs.length,
    byStatus,
    rounds: [...rounds],
    firstActivityAt,
    lastActivityAt,
  };
}

function toNodeSummary(user: UserRow, lastActivityAt: string | null): NodeSummary {
  return {
    node_id: user.user_id,
    hospital_name: user.hospital_name ?? "",
    pincode: user.pincode,
    geolocation: toGeolocation(user.geolocation),
    contact_email: user.email,
    joined_at: user.created_at,
    last_activity_at: lastActivityAt,
    status: deriveStatus(lastActivityAt),
  };
}

function getLastActivity(logs: Array<{ timestamp: string }>): string | null {
  return logs.at(-1)?.timestamp ?? null;
}

function deriveStatus(lastActivityAt: string | null): NodeStatus {
  if (!lastActivityAt) {
    return "registered";
  }

  const isActive = Date.now() - new Date(lastActivityAt).getTime() <= ACTIVE_THRESHOLD_MS;

  return isActive ? "active" : "idle";
}

function toGeolocation(value: unknown): NodeGeolocation {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as NodeGeolocation;
  }

  return {};
}

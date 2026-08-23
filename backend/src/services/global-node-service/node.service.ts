import type { JsonValue } from "@prisma/client/runtime/library";
import { prisma } from "../../config/prisma.js";
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

const ACTIVE_THRESHOLD_MS = 24 * 60 * 60 * 1000;
const ONLINE_THRESHOLD_MS = 5 * 60 * 1000;

interface HospitalUserRecord {
  userId: string;
  email: string;
  role: string;
  hospitalName: string | null;
  pincode: string | null;
  geolocation: JsonValue;
  createdAt: Date;
  updatedAt: Date;
}

interface LogEntry {
  round: number;
  direction: string;
  status: string;
  timestamp: Date;
}

interface LogStats {
  total: number;
  byStatus: Record<string, number>;
  rounds: number[];
  firstActivityAt: Date | null;
  lastActivityAt: Date | null;
}

export async function getNodes(): Promise<NodeSummary[]> {
  const [users, logGroups] = await Promise.all([
    prisma.user.findMany({
      where: { role: "local", hospitalName: { not: null } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.log.groupBy({
      by: ["nodeId"],
      _max: { timestamp: true },
    }),
  ]);

  const lastActivityByNode = new Map(
    logGroups.map((group) => [group.nodeId, group._max.timestamp]),
  );

  return users.map((user) =>
    toNodeSummary(user, lastActivityByNode.get(user.userId) ?? null),
  );
}

export async function getNode(nodeId: string): Promise<NodeDetail | null> {
  const user = await findHospitalUser(nodeId);

  if (!user) {
    return null;
  }

  const logs = await prisma.log.findMany({
    where: { nodeId },
    orderBy: [{ round: "asc" }, { timestamp: "asc" }],
  });

  return {
    node_id: user.userId,
    hospital_name: user.hospitalName ?? "",
    pincode: user.pincode,
    geolocation: toGeolocation(user.geolocation),
    contact_email: user.email,
    joined_at: toIso(user.createdAt),
    updated_at: toIso(user.updatedAt),
    status: deriveStatus(getLastActivity(logs)),
    participation_history: buildParticipationHistory(logs),
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
  const directCount = await prisma.log.count({ where: { nodeId } });
  const targetNodeId = directCount > 0 ? nodeId : { in: [nodeId, DEMO_FALLBACK_NODE_ID] };

  const [user, latestLog, roundAggregate] = await Promise.all([
    findHospitalUser(nodeId),
    prisma.log.findFirst({
      where: { nodeId: targetNodeId },
      orderBy: { timestamp: "desc" },
    }),
    prisma.log.aggregate({ where: { nodeId: targetNodeId }, _max: { round: true } }),
  ]);

  if (!user) {
    return null;
  }

  const lastActivityAt = latestLog?.timestamp ?? null;
  const federationState: NodeFederationState = {
    latest_round_seen: roundAggregate._max.round ?? null,
    last_direction: latestLog?.direction ?? null,
    last_status: latestLog?.status ?? null,
  };

  return {
    node_id: user.userId,
    hospital_name: user.hospitalName ?? "",
    status: deriveStatus(lastActivityAt),
    federation_state: federationState,
    last_activity_at: lastActivityAt ? toIso(lastActivityAt) : null,
  };
}

export async function getNodeMetrics(
  nodeId: string,
): Promise<NodeMetrics | null> {
  const [user, logs] = await Promise.all([
    findHospitalUser(nodeId),
    prisma.log.findMany({
      where: { nodeId },
      select: { round: true, status: true, timestamp: true },
      orderBy: { timestamp: "asc" },
    }),
  ]);

  if (!user) {
    return null;
  }

  const stats = buildLogStats(logs);

  return {
    node_id: user.userId,
    hospital_name: user.hospitalName ?? "",
    total_exchanges: stats.total,
    rounds_participated: stats.rounds.length,
    exchanges_by_status: stats.byStatus,
    first_activity_at: stats.firstActivityAt ? toIso(stats.firstActivityAt) : null,
    last_activity_at: stats.lastActivityAt ? toIso(stats.lastActivityAt) : null,
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
  const [user, latestLog] = await Promise.all([
    findHospitalUser(nodeId),
    prisma.log.findFirst({ where: { nodeId }, orderBy: { timestamp: "desc" } }),
  ]);

  if (!user) {
    return null;
  }

  const lastSeenAt = latestLog?.timestamp ?? null;
  const online =
    lastSeenAt !== null && Date.now() - lastSeenAt.getTime() <= ONLINE_THRESHOLD_MS;

  return {
    node_id: user.userId,
    hospital_name: user.hospitalName ?? "",
    online,
    last_seen_at: lastSeenAt ? toIso(lastSeenAt) : null,
    checked_at: toIso(new Date()),
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
  const where = { role: "local", hospitalName: { not: null } } as const;

  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: { hospitalName: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  const logGroups = users.length
    ? await prisma.log.groupBy({
        by: ["nodeId"],
        where: { nodeId: { in: users.map((user) => user.userId) } },
        _max: { timestamp: true },
      })
    : [];

  const lastSeenByNode = new Map(
    logGroups.map((group) => [group.nodeId, group._max.timestamp]),
  );

  const now = Date.now();
  const checkedAt = new Date(now);

  const nodes: NodeHealth[] = users.map((user) => {
    const lastSeenAt = lastSeenByNode.get(user.userId) ?? null;
    const online = lastSeenAt !== null && now - lastSeenAt.getTime() <= ONLINE_THRESHOLD_MS;

    return {
      node_id: user.userId,
      hospital_name: user.hospitalName ?? "",
      online,
      last_seen_at: lastSeenAt ? toIso(lastSeenAt) : null,
      checked_at: toIso(checkedAt),
    };
  });

  return {
    checked_at: toIso(checkedAt),
    nodes,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize) || 0,
    },
  };
}

async function findHospitalUser(
  nodeId: string,
): Promise<HospitalUserRecord | null> {
  const user = await prisma.user.findUnique({ where: { userId: nodeId } });

  if (!user || user.role !== "local" || !user.hospitalName) {
    return null;
  }

  return user;
}

function buildParticipationHistory(logs: LogEntry[]): NodeRoundParticipation[] {
  interface RoundAccumulator {
    directions: Set<string>;
    statuses: Set<string>;
    exchanges: number;
    lastActivityAt: Date;
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
    last_activity_at: toIso(entry.lastActivityAt),
  }));
}

function buildLogStats(
  logs: Array<{ round: number; status: string; timestamp: Date }>,
): LogStats {
  const byStatus: Record<string, number> = {};
  const rounds = new Set<number>();
  let firstActivityAt: Date | null = null;
  let lastActivityAt: Date | null = null;

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

function toNodeSummary(
  user: HospitalUserRecord,
  lastActivityAt: Date | null,
): NodeSummary {
  return {
    node_id: user.userId,
    hospital_name: user.hospitalName ?? "",
    pincode: user.pincode,
    geolocation: toGeolocation(user.geolocation),
    contact_email: user.email,
    joined_at: toIso(user.createdAt),
    last_activity_at: lastActivityAt ? toIso(lastActivityAt) : null,
    status: deriveStatus(lastActivityAt),
  };
}

function getLastActivity(
  logs: Array<{ timestamp: Date }>,
): Date | null {
  return logs.at(-1)?.timestamp ?? null;
}

function deriveStatus(lastActivityAt: Date | null): NodeStatus {
  if (!lastActivityAt) {
    return "registered";
  }

  const isActive =
    Date.now() - lastActivityAt.getTime() <= ACTIVE_THRESHOLD_MS;

  return isActive ? "active" : "idle";
}

function toGeolocation(value: JsonValue): NodeGeolocation {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as NodeGeolocation;
  }

  return {};
}

function toIso(date: Date): string {
  return date.toISOString();
}

import type { JsonValue } from "@prisma/client/runtime/library";
import { prisma } from "../../config/prisma.js";
import type {
  NodeDetail,
  NodeFederationState,
  NodeGeolocation,
  NodeMetrics,
  NodeRoundParticipation,
  NodeStatus,
  NodeStatusInfo,
  NodeSummary,
} from "../../interfaces/model/node.interface.js";

const ACTIVE_THRESHOLD_MS = 24 * 60 * 60 * 1000;

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

export async function getNodeStatus(
  nodeId: string,
): Promise<NodeStatusInfo | null> {
  const [user, latestLog, roundAggregate] = await Promise.all([
    findHospitalUser(nodeId),
    prisma.log.findFirst({
      where: { nodeId },
      orderBy: { timestamp: "desc" },
    }),
    prisma.log.aggregate({ where: { nodeId }, _max: { round: true } }),
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

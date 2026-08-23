import type { JsonValue } from "@prisma/client/runtime/library";
import { prisma } from "../../config/prisma.js";
import type {
  Log,
  LogFilters,
  PaginatedLogs,
} from "../../interfaces/model/log.interface.js";

/**
 * Global-wide log view — every node's logs at once, no per-hospital
 * scoping. Global has no "own node," so unlike the local-node view there's
 * no demo fallback here: an empty result is a real empty result.
 */
export async function getAllLogs(filters: LogFilters): Promise<PaginatedLogs> {
  return queryLogs(buildWhere(filters), filters);
}

/**
 * One specific hospital's logs, for the global node inspecting a node it
 * manages. Returns null if the node isn't a registered, onboarded local
 * hospital — the controller maps that to 404.
 */
export async function getLogsForNode(
  nodeId: string,
  filters: LogFilters,
): Promise<PaginatedLogs | null> {
  const node = await prisma.user.findUnique({ where: { userId: nodeId } });

  if (!node || node.role !== "local" || !node.hospitalName) {
    return null;
  }

  return queryLogs({ ...buildWhere(filters), nodeId }, filters);
}

/**
 * Every log row written during one federated round, across every
 * participating node. `federated_rounds.round_id` (a uuid) is resolved to
 * the numeric `logs.round` it corresponds to. Returns null if no round with
 * that id exists — the controller maps that to 404.
 */
export async function getLogsForRound(
  roundId: string,
  filters: LogFilters,
): Promise<PaginatedLogs | null> {
  const round = await prisma.federatedRound.findUnique({ where: { roundId } });

  if (!round) {
    return null;
  }

  return queryLogs({ ...buildWhere(filters), round: round.round }, filters);
}

function buildWhere(filters: LogFilters) {
  return {
    ...(filters.direction !== undefined ? { direction: filters.direction } : {}),
    ...(filters.status !== undefined ? { status: filters.status } : {}),
    ...(filters.round !== undefined ? { round: filters.round } : {}),
  };
}

async function queryLogs(
  where: Record<string, unknown>,
  filters: LogFilters,
): Promise<PaginatedLogs> {
  const [logs, total] = await Promise.all([
    prisma.log.findMany({
      where,
      orderBy: [{ round: "desc" }, { timestamp: "desc" }],
      take: filters.pageSize,
      skip: (filters.page - 1) * filters.pageSize,
    }),
    prisma.log.count({ where }),
  ]);

  return {
    logs: logs.map(toLog),
    pagination: {
      page: filters.page,
      pageSize: filters.pageSize,
      total,
      totalPages: Math.ceil(total / filters.pageSize),
    },
  };
}

function toLog(log: {
  logId: string;
  nodeId: string;
  timestamp: Date;
  direction: string;
  round: number;
  metadata: JsonValue;
  status: string;
  createdAt: Date;
}): Log {
  return {
    log_id: log.logId,
    node_id: log.nodeId,
    timestamp: log.timestamp.toISOString(),
    direction: log.direction as Log["direction"],
    round: log.round,
    metadata: (log.metadata ?? {}) as Log["metadata"],
    status: log.status as Log["status"],
    created_at: log.createdAt.toISOString(),
  };
}

import type { JsonValue } from "@prisma/client/runtime/library";
import { prisma } from "../../config/prisma.js";
import type {
  Log,
  LogFilters,
  PaginatedLogs,
} from "../../interfaces/model/log.interface.js";

/**
 * Demo hospital shown to any account with zero real activity of its own, so
 * an empty account still has something to display. Points at the real
 * "AIIMS Delhi" user row (not a made-up node id) so the fallback data is
 * actually backed by a real hospital record.
 */
const DEMO_FALLBACK_NODE_ID = "1bb53b66-de9d-432b-8851-9cedd26f1ea9";

export async function getLogs(
  nodeId: string,
  filters: LogFilters,
): Promise<PaginatedLogs> {
  const directCount = await prisma.log.count({ where: { nodeId } });
  const targetNodeId = directCount > 0 ? nodeId : { in: [nodeId, DEMO_FALLBACK_NODE_ID] };

  const where = {
    nodeId: targetNodeId,
    ...(filters.direction !== undefined ? { direction: filters.direction } : {}),
    ...(filters.status !== undefined ? { status: filters.status } : {}),
    ...(filters.round !== undefined ? { round: filters.round } : {}),
  };

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

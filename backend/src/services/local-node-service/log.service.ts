import { supabase } from "../../config/supabase.js";
import type {
  Log,
  LogFilters,
  PaginatedLogs,
} from "../../interfaces/model/log.interface.js";
import type { Database } from "../../types/supabase.js";

type LogRow = Database["public"]["Tables"]["logs"]["Row"];

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
  const { count: directCount, error: countError } = await supabase
    .from("logs")
    .select("*", { count: "exact", head: true })
    .eq("node_id", nodeId);

  if (countError) {
    throw new Error(countError.message);
  }

  const targetNodeIds =
    directCount && directCount > 0 ? [nodeId] : [nodeId, DEMO_FALLBACK_NODE_ID];

  let query = supabase
    .from("logs")
    .select("*", { count: "exact" })
    .in("node_id", targetNodeIds);

  if (filters.direction !== undefined) query = query.eq("direction", filters.direction);
  if (filters.status !== undefined) query = query.eq("status", filters.status);
  if (filters.round !== undefined) query = query.eq("round", filters.round);

  const from = (filters.page - 1) * filters.pageSize;
  const to = from + filters.pageSize - 1;

  const { data: logs, count: total, error } = await query
    .order("round", { ascending: false })
    .order("timestamp", { ascending: false })
    .range(from, to);

  if (error) {
    throw new Error(error.message);
  }

  return {
    logs: (logs ?? []).map(toLog),
    pagination: {
      page: filters.page,
      pageSize: filters.pageSize,
      total: total ?? 0,
      totalPages: Math.ceil((total ?? 0) / filters.pageSize),
    },
  };
}

/**
 * PostgREST serializes `timestamptz` without a timezone designator
 * ("2026-08-27T04:44:02.892") even though the stored value is UTC. Re-emit a
 * fully-qualified UTC ISO string so browser-side `new Date()` — which parses
 * offset-less strings as local time — displays the correct instant everywhere.
 */
function toUtcIso(value: string): string {
  const hasTz = /(Z|[+-]\d{2}:?\d{2})$/i.test(value);
  return new Date(hasTz ? value : `${value}Z`).toISOString();
}

function toLog(log: LogRow): Log {
  return {
    log_id: log.log_id,
    node_id: log.node_id,
    timestamp: toUtcIso(log.timestamp),
    direction: log.direction as Log["direction"],
    round: log.round,
    metadata: (log.metadata ?? {}) as Log["metadata"],
    status: log.status as Log["status"],
    created_at: toUtcIso(log.created_at),
  };
}

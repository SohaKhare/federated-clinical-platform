import { supabase } from "../../config/supabase.js";
import type {
  Log,
  LogFilters,
  PaginatedLogs,
} from "../../interfaces/model/log.interface.js";
import type { Database } from "../../types/supabase.js";

type LogRow = Database["public"]["Tables"]["logs"]["Row"];

/**
 * Global-wide log view — every node's logs at once, no per-hospital
 * scoping. Global has no "own node," so unlike the local-node view there's
 * no demo fallback here: an empty result is a real empty result.
 */
export async function getAllLogs(filters: LogFilters): Promise<PaginatedLogs> {
  return queryLogs(filters);
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
  const { data: node, error } = await supabase
    .from("users")
    .select("user_id, role, hospital_name")
    .eq("user_id", nodeId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!node || node.role !== "local" || !node.hospital_name) {
    return null;
  }

  return queryLogs(filters, nodeId);
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
  const { data: round, error } = await supabase
    .from("federated_rounds")
    .select("round")
    .eq("round_id", roundId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!round) {
    return null;
  }

  return queryLogs(filters, undefined, round.round);
}

async function queryLogs(
  filters: LogFilters,
  nodeId?: string,
  round?: number,
): Promise<PaginatedLogs> {
  let query = supabase.from("logs").select("*", { count: "exact" });

  if (nodeId !== undefined) query = query.eq("node_id", nodeId);
  if (round !== undefined) query = query.eq("round", round);
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

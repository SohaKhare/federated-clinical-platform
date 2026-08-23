export const LOG_DIRECTIONS = ["outgoing", "incoming"] as const;
export type LogDirection = (typeof LOG_DIRECTIONS)[number];

export const LOG_STATUSES = [
  "pending",
  "confirmed",
  "failed",
  "preparing",
  "submitted",
  "received",
  "applied",
  "synced",
] as const;
export type LogStatus = (typeof LOG_STATUSES)[number];

export interface LogMetadata {
  [key: string]: unknown;
}

export interface Log {
  log_id: string;
  node_id: string;
  timestamp: string;
  direction: LogDirection;
  round: number;
  metadata: LogMetadata;
  status: LogStatus;
  created_at: string;
}

export interface LogFilters {
  direction?: LogDirection;
  status?: LogStatus;
  round?: number;
  page: number;
  pageSize: number;
}

export interface LogPagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface PaginatedLogs {
  logs: Log[];
  pagination: LogPagination;
}

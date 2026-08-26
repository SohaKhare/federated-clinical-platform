import type { Request, Response } from "express";

import { getLogs as getLogsRecords } from "../../services/local-node-service/log.service.js";
import {
  LOG_DIRECTIONS,
  LOG_STATUSES,
  type LogDirection,
  type LogFilters,
  type LogStatus,
} from "../../interfaces/model/log.interface.js";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 200;

export async function getLogs(req: Request, res: Response) {
  const filters = parseLogFilters(req.query);

  if (!filters) {
    return res.status(400).json({
      message:
        "Invalid query. direction must be 'outgoing' or 'incoming', status must be 'pending', 'confirmed', 'failed', 'preparing', 'submitted', 'received', 'applied', or 'synced', round must be a non-negative integer, page must be a positive integer, and pageSize must be a positive integer up to 200.",
    });
  }

  try {
    const nodeId = req.user!.userId;
    const { logs, pagination } = await getLogsRecords(nodeId, filters);

    return res.json({ logs, pagination });
  } catch (error) {
    console.error("Log fetch error:", error);

    return res.status(500).json({
      message: "Unable to fetch logs.",
    });
  }
}

export function parseLogFilters(query: Request["query"]): LogFilters | null {
  const { direction, status, round, page, pageSize } = query;

  if (
    direction !== undefined &&
    !(LOG_DIRECTIONS as readonly string[]).includes(direction as string)
  ) {
    return null;
  }

  if (
    status !== undefined &&
    !(LOG_STATUSES as readonly string[]).includes(status as string)
  ) {
    return null;
  }

  const parsedRound = parseNonNegativeInt(round);
  if (round !== undefined && parsedRound === null) {
    return null;
  }

  const parsedPage = page === undefined ? 1 : parsePositiveInt(page);
  if (parsedPage === null) {
    return null;
  }

  const parsedPageSize =
    pageSize === undefined ? DEFAULT_PAGE_SIZE : parsePositiveInt(pageSize);
  if (parsedPageSize === null || parsedPageSize > MAX_PAGE_SIZE) {
    return null;
  }

  return {
    ...(direction !== undefined ? { direction: direction as LogDirection } : {}),
    ...(status !== undefined ? { status: status as LogStatus } : {}),
    ...(parsedRound !== null && round !== undefined ? { round: parsedRound } : {}),
    page: parsedPage,
    pageSize: parsedPageSize,
  };
}

function parseNonNegativeInt(value: unknown): number | null {
  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    return null;
  }

  return Number(value);
}

function parsePositiveInt(value: unknown): number | null {
  const parsed = parseNonNegativeInt(value);

  return parsed !== null && parsed > 0 ? parsed : null;
}

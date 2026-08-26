import type { Request, Response } from "express";

import {
  getAllLogs as getAllLogsRecords,
  getLogsForNode as getLogsForNodeRecords,
  getLogsForRound as getLogsForRoundRecords,
} from "../../services/global-node-service/log.service.js";
import {
  LOG_DIRECTIONS,
  LOG_STATUSES,
  type LogDirection,
  type LogFilters,
  type LogStatus,
} from "../../interfaces/model/log.interface.js";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 200;

function parseLogFilters(query: Request["query"]): LogFilters | null {
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

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const QUERY_ERROR_MESSAGE =
  "Invalid query. direction must be 'outgoing' or 'incoming', status must be 'pending', 'confirmed', 'failed', 'preparing', 'submitted', 'received', 'applied', or 'synced', round must be a non-negative integer, page must be a positive integer, and pageSize must be a positive integer up to 200.";

/** GET /logs, when the caller is a global user. */
export async function getAllLogs(req: Request, res: Response) {
  const filters = parseLogFilters(req.query);

  if (!filters) {
    return res.status(400).json({ message: QUERY_ERROR_MESSAGE });
  }

  try {
    const { logs, pagination } = await getAllLogsRecords(filters);

    return res.json({ logs, pagination });
  } catch (error) {
    console.error("Global log fetch error:", error);

    return res.status(500).json({ message: "Unable to fetch logs." });
  }
}

/** GET /logs/:nodeId — global only. */
export async function getNodeLogs(req: Request, res: Response) {
  const { nodeId } = req.params;

  if (!isValidUuid(nodeId)) {
    return res.status(400).json({ message: "Invalid node ID." });
  }

  const filters = parseLogFilters(req.query);

  if (!filters) {
    return res.status(400).json({ message: QUERY_ERROR_MESSAGE });
  }

  try {
    const result = await getLogsForNodeRecords(nodeId, filters);

    if (!result) {
      return res.status(404).json({ message: "Node not found." });
    }

    return res.json(result);
  } catch (error) {
    console.error("Node log fetch error:", error);

    return res.status(500).json({ message: "Unable to fetch logs." });
  }
}

/** GET /logs/round/:roundId — global only. */
export async function getRoundLogs(req: Request, res: Response) {
  const { roundId } = req.params;

  if (!isValidUuid(roundId)) {
    return res.status(400).json({ message: "Invalid round ID." });
  }

  const filters = parseLogFilters(req.query);

  if (!filters) {
    return res.status(400).json({ message: QUERY_ERROR_MESSAGE });
  }

  try {
    const result = await getLogsForRoundRecords(roundId, filters);

    if (!result) {
      return res.status(404).json({ message: "Round not found." });
    }

    return res.json(result);
  } catch (error) {
    console.error("Round log fetch error:", error);

    return res.status(500).json({ message: "Unable to fetch logs." });
  }
}

function isValidUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

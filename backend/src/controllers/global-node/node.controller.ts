import type { Request, Response } from "express";

import {
  getNode as getNodeRecord,
  getNodes as getNodeRecords,
  getNodeHealth as getNodeHealthRecord,
  getNodesHealth as getNodesHealthRecords,
  getNodeMetrics as getNodeMetricsRecord,
  getNodeStatus as getNodeStatusRecord,
} from "../../services/global-node-service/node.service.js";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 200;

export async function getNodes(_req: Request, res: Response) {
  try {
    const nodes = await getNodeRecords();

    return res.json({ nodes });
  } catch (error) {
    console.error("Node list fetch error:", error);

    return res.status(500).json({
      message: "Unable to fetch registered nodes.",
    });
  }
}

export async function getNode(req: Request, res: Response) {
  const { id } = req.params;

  if (!isValidNodeId(id)) {
    return res.status(400).json({ message: "Invalid node ID." });
  }

  try {
    const node = await getNodeRecord(id);

    if (!node) {
      return res.status(404).json({
        message: "Node not found.",
      });
    }

    return res.json({ node });
  } catch (error) {
    console.error("Node fetch error:", error);

    return res.status(500).json({
      message: "Unable to fetch node.",
    });
  }
}

export async function getNodeStatus(req: Request, res: Response) {
  const { id } = req.params;

  if (!isValidNodeId(id)) {
    return res.status(400).json({ message: "Invalid node ID." });
  }

  try {
    const status = await getNodeStatusRecord(id);

    if (!status) {
      return res.status(404).json({
        message: "Node not found.",
      });
    }

    return res.json(status);
  } catch (error) {
    console.error("Node status fetch error:", error);

    return res.status(500).json({
      message: "Unable to fetch node status.",
    });
  }
}

export async function getNodeMetrics(req: Request, res: Response) {
  const { id } = req.params;

  if (!isValidNodeId(id)) {
    return res.status(400).json({ message: "Invalid node ID." });
  }

  try {
    const metrics = await getNodeMetricsRecord(id);

    if (!metrics) {
      return res.status(404).json({
        message: "Node not found.",
      });
    }

    return res.json(metrics);
  } catch (error) {
    console.error("Node metrics fetch error:", error);

    return res.status(500).json({
      message: "Unable to fetch node metrics.",
    });
  }
}

export async function getNodeHealth(req: Request, res: Response) {
  const { id } = req.params;

  if (!isValidNodeId(id)) {
    return res.status(400).json({ message: "Invalid node ID." });
  }

  try {
    const health = await getNodeHealthRecord(id);

    if (!health) {
      return res.status(404).json({
        message: "Node not found.",
      });
    }

    return res.json(health);
  } catch (error) {
    console.error("Node health check error:", error);

    return res.status(500).json({
      message: "Unable to check node health.",
    });
  }
}

export async function getNodesHealth(req: Request, res: Response) {
  const pagination = parsePagination(req.query);

  if (!pagination) {
    return res.status(400).json({
      message: "Invalid query. page must be a positive integer, and pageSize must be a positive integer up to 200.",
    });
  }

  try {
    const result = await getNodesHealthRecords(pagination.page, pagination.pageSize);

    return res.json(result);
  } catch (error) {
    console.error("Node health list fetch error:", error);

    return res.status(500).json({
      message: "Unable to check node health.",
    });
  }
}

function parsePagination(
  query: Request["query"],
): { page: number; pageSize: number } | null {
  const { page, pageSize } = query;

  const parsedPage = page === undefined ? 1 : parsePositiveInt(page);
  if (parsedPage === null) {
    return null;
  }

  const parsedPageSize = pageSize === undefined ? DEFAULT_PAGE_SIZE : parsePositiveInt(pageSize);
  if (parsedPageSize === null || parsedPageSize > MAX_PAGE_SIZE) {
    return null;
  }

  return { page: parsedPage, pageSize: parsedPageSize };
}

function parsePositiveInt(value: unknown): number | null {
  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    return null;
  }

  const parsed = Number(value);

  return parsed > 0 ? parsed : null;
}

function isValidNodeId(id: unknown): id is string {
  return typeof id === "string" && UUID_PATTERN.test(id);
}

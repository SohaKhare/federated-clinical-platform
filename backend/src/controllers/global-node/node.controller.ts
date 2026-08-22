import type { Request, Response } from "express";

import {
  getNode as getNodeRecord,
  getNodes as getNodeRecords,
  getNodeMetrics as getNodeMetricsRecord,
  getNodeStatus as getNodeStatusRecord,
} from "../../services/global-node-service/node.service.js";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

function isValidNodeId(id: unknown): id is string {
  return typeof id === "string" && UUID_PATTERN.test(id);
}

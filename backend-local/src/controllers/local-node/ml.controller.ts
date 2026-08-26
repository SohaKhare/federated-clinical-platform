import type { Request, Response } from "express";

import {
  getLocalModelInfo,
  getLocalModelMetrics,
  startLocalTraining,
} from "../../services/local-node-service/ml.service.js";
import type { LocalTrainingStartInput } from "../../interfaces/model/federation-round.interface.js";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getModelInfo(req: Request, res: Response) {
  try {
    const info = await getLocalModelInfo(req.user!.userId);

    return res.json(info);
  } catch (error) {
    console.error("Local model info fetch error:", error);

    return res.status(500).json({ message: "Unable to fetch local model info." });
  }
}

export async function getModelMetrics(req: Request, res: Response) {
  try {
    const metrics = await getLocalModelMetrics(req.user!.userId);

    return res.json(metrics);
  } catch (error) {
    console.error("Local model metrics fetch error:", error);

    return res.status(500).json({ message: "Unable to fetch local model metrics." });
  }
}

export async function startTraining(req: Request, res: Response) {
  const { roundId } = req.params;

  if (
    typeof roundId !== "string" ||
    !UUID_PATTERN.test(roundId) ||
    !isPositiveInteger(req.body?.round)
  ) {
    return res.status(400).json({ message: "round and roundId are required." });
  }

  const config = req.body?.config;

  if (config !== undefined && (!config || typeof config !== "object" || Array.isArray(config))) {
    return res.status(400).json({ message: "config must be a JSON object." });
  }

  try {
    const result = await startLocalTraining(
      [req.user!.userId],
      roundId,
      req.body.round,
      { ...(config !== undefined ? { config } : {}) } as LocalTrainingStartInput,
    );

    return res.status(202).json(result);
  } catch (error) {
    console.error("Local training start error:", error);

    return res.status(502).json({ message: "Unable to reach the ML service." });
  }
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}
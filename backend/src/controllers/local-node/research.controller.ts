import type { Request, Response } from "express";

import {
  getResearchSummary as getResearchSummaryRecord,
  getResearchInsights as getResearchInsightsRecord,
} from "../../services/local-node-service/research.service.js";

export async function getResearchSummary(req: Request, res: Response) {
  try {
    const summary = await getResearchSummaryRecord(req.user!.userId);

    return res.json(summary);
  } catch (error) {
    console.error("Research summary fetch error:", error);

    return res.status(500).json({ message: "Unable to fetch research summary." });
  }
}

export async function getResearchInsights(req: Request, res: Response) {
  try {
    const insights = await getResearchInsightsRecord(req.user!.userId);

    return res.json(insights);
  } catch (error) {
    console.error("Research insights fetch error:", error);

    return res.status(500).json({ message: "Unable to fetch research insights." });
  }
}

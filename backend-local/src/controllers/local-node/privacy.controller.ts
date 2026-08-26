import type { Request, Response } from "express";

import { getPrivacyParameters as getPrivacyParametersRecord } from "../../services/local-node-service/privacy.service.js";

export async function getPrivacyParameters(req: Request, res: Response) {
  try {
    const parameters = await getPrivacyParametersRecord(req.session.user!.userId);

    return res.json(parameters);
  } catch (error) {
    console.error("Privacy parameters fetch error:", error);

    return res.status(500).json({ message: "Unable to fetch privacy parameters." });
  }
}

import type { NextFunction, Request, Response } from "express";

import { env } from "../config/env.js";

export function requireFederationKey(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (req.header("X-Federation-Key") !== env.federationSharedSecret) {
    return res.status(401).json({ message: "Invalid federation key." });
  }

  next();
}
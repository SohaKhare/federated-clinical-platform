import type { NextFunction, Request, Response } from "express";

import type { UserRole } from "../auth/roles.js";
import { env } from "../config/env.js";
import { verifyAuthToken } from "../config/jwt.js";
import { getUserById } from "../services/user.service.js";

/**
 * Verifies the JWT in the auth cookie and attaches the current user to
 * `req.user`. The token only carries a user id — the row is re-read on
 * every request, since role/onboarded can change after the token was issued
 * (role is stamped at login from env.nodeRole).
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const token = req.cookies?.[env.authCookieName];
  const payload = token ? verifyAuthToken(token) : null;

  if (!payload) {
    return res.status(401).json({
      message: "Authentication required.",
    });
  }

  try {
    const user = await getUserById(payload.userId);

    if (!user) {
      return res.status(401).json({
        message: "Authentication required.",
      });
    }

    req.user = user;

    next();
  } catch (error) {
    console.error("Failed to resolve authenticated user:", error);

    return res
      .status(500)
      .json({ message: "Unable to verify the current user." });
  }
}

/**
 * Must be used after requireAuth.
 *
 * Usage:
 *   router.get("/admin", requireAuth, requireRole("global"), handler)
 *   router.get("/hospital", requireAuth, requireRole("local"), handler)
 */
export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;

    if (!user) {
      return res.status(401).json({
        message: "Authentication required.",
      });
    }

    if (!roles.includes(user.role)) {
      return res.status(403).json({
        message: `Access denied. Requires role: ${roles.join(" or ")}.`,
        yourRole: user.role,
      });
    }

    next();
  };
}

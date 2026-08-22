import type { NextFunction, Request, Response } from "express";

import type { UserRole } from "../auth/roles.js";

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.user) {
    return res.status(401).json({
      message: "Authentication required.",
    });
  }

  next();
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
    const user = req.session.user;

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

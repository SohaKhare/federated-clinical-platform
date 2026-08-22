import { Router } from "express";

import { requireAuth, requireRole } from "../middleware/auth.middleware.js";

const router = Router();

// GLOBAL node only — federated server side.
router.get(
  "/federated/status",
  requireAuth,
  requireRole("global"),
  (req, res) => {
    res.json({
      role: "global",
      user: req.session.user?.email,
      message: "Federated server dashboard data.",
    });
  },
);

// LOCAL node only — hospital/clinic/research-institution side.
router.get("/hospital/summary", requireAuth, requireRole("local"), (req, res) => {
  res.json({
    role: "local",
    user: req.session.user?.email,
    message: "Local institution dashboard data.",
  });
});

export default router;

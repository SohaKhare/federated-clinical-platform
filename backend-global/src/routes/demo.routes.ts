import { Router } from "express";

import { requireAuth, requireRole } from "../middleware/auth.middleware.js";

const router = Router();

router.get("/federated/status", requireAuth, requireRole("global"), (req, res) => {
  res.json({
    role: "global",
    user: req.session.user?.email,
    message: "Federated server dashboard data.",
  });
});

export default router;

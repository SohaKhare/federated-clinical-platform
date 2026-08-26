import { Router } from "express";

import { requireAuth, requireRole } from "../middleware/auth.middleware.js";

const router = Router();

router.get("/hospital/summary", requireAuth, requireRole("local"), (req, res) => {
  res.json({
    role: "local",
    user: req.user?.email,
    message: "Local institution dashboard data.",
  });
});

export default router;

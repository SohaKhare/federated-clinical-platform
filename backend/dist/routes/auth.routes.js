import { Router } from "express";
import { loginWithGoogle, googleCallback, getCurrentUser, logout, } from "../controllers/auth.controller.js";
import { onboardUser } from "../controllers/onboarding.controller.js";
import { requireAuth, requireRole } from "../middleware/auth.middleware.js";
const router = Router();
// Google OAuth
router.get("/google", loginWithGoogle);
router.get("/google/callback", googleCallback);
// Application authentication
router.get("/me", getCurrentUser);
router.post("/logout", logout);
router.post("/onboarding", requireAuth, requireRole("local"), onboardUser);
export default router;
//# sourceMappingURL=auth.routes.js.map
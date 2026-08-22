import { Router } from "express";

import {
  loginWithGoogle,
  googleCallback,
  getCurrentUser,
  logout,
} from "../controllers/auth.controller.js";

const router = Router();

// Google OAuth
router.get("/google/:node", loginWithGoogle);

router.get("/google/:node/callback", googleCallback);

// Application authentication
router.get("/me", getCurrentUser);

router.post("/logout", logout);

export default router;

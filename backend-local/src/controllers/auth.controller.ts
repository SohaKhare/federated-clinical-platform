import crypto from "node:crypto";

import type { Request, Response } from "express";

import {
  getGoogleClient,
  getGoogleClientId,
} from "../services/google-auth.service.js";
import { getUserById, upsertLocalUser } from "../services/user.service.js";
import { env } from "../config/env.js";

/**
 * Start Google OAuth login.
 *
 * GET /auth/google
 *
 * Every login creates/authenticates a "local" user. A user is promoted to
 * "global" by manually updating their role in the database.
 */
export function loginWithGoogle(req: Request, res: Response) {
  // Generate OAuth state to protect against CSRF.
  const state = crypto.randomUUID();

  req.session.oauthState = state;

  const client = getGoogleClient();

  const authorizationUrl = client.generateAuthUrl({
    access_type: "online",
    scope: ["openid", "email", "profile"],
    state,
    prompt: "select_account",
  });

  return res.redirect(authorizationUrl);
}

/**
 * Handle Google's OAuth callback.
 *
 * GET /auth/google/callback
 */
export async function googleCallback(req: Request, res: Response) {
  try {
    const { code, state } = req.query;

    // Google must provide an authorization code.
    if (!code || typeof code !== "string") {
      return res.status(400).json({
        message: "Missing authorization code.",
      });
    }

    // Validate OAuth state.
    if (
      !state ||
      typeof state !== "string" ||
      state !== req.session.oauthState
    ) {
      return res.status(400).json({
        message: "Invalid OAuth state.",
      });
    }

    const client = getGoogleClient();

    // Exchange authorization code for tokens.
    const { tokens } = await client.getToken(code);

    if (!tokens.id_token) {
      return res.status(401).json({
        message: "Google did not return an ID token.",
      });
    }

    client.setCredentials(tokens);

    // Verify the Google ID token.
    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token,
      audience: getGoogleClientId(),
    });

    const payload = ticket.getPayload();

    if (!payload?.sub || !payload.email) {
      return res.status(401).json({
        message: "Unable to verify Google account.",
      });
    }

    req.session.user = await upsertLocalUser({
      googleId: payload.sub,
      email: payload.email,
      ...(payload.picture !== undefined ? { picture: payload.picture } : {}),
    });

    // OAuth information is no longer needed.
    delete req.session.oauthState;

    /*
     * Redirect the user back to Next.js.
     *
     * Later we can redirect to different dashboards
     * depending on the node/role.
     */
    return res.redirect(`${env.frontendUrl}/`);
  } catch (error) {
    console.error("Google OAuth error:", error);

    return res.status(500).json({
      message: "Google authentication failed.",
    });
  }
}

/**
 * GET /auth/me
 *
 * Re-reads the user's row on every call instead of trusting the session's
 * cached copy — role is promoted by editing the database directly, and an
 * already-logged-in session must pick that up without requiring a re-login.
 */
export async function getCurrentUser(req: Request, res: Response) {
  if (!req.session.user) {
    return res.status(401).json({
      authenticated: false,
      message: "Not authenticated.",
    });
  }

  try {
    const current = await getUserById(req.session.user.userId);

    if (!current) {
      return res.status(401).json({
        authenticated: false,
        message: "Not authenticated.",
      });
    }

    req.session.user = current;

    return res.json({
      authenticated: true,
      user: current,
    });
  } catch (error) {
    console.error("Failed to refresh session user:", error);

    return res.status(500).json({ message: "Unable to load the current user." });
  }
}

/**
 * POST /auth/logout
 */
export function logout(req: Request, res: Response) {
  req.session.destroy((error) => {
    if (error) {
      console.error("Session destruction error:", error);

      return res.status(500).json({
        message: "Logout failed.",
      });
    }

    res.clearCookie("connect.sid");

    return res.json({
      message: "Logged out successfully.",
    });
  });
}

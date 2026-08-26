import crypto from "node:crypto";

import type { Request, Response } from "express";

import {
  getGoogleClient,
  getGoogleClientId,
} from "../services/google-auth.service.js";
import { getUserById, upsertLocalUser } from "../services/user.service.js";
import { env } from "../config/env.js";
import { signAuthToken, verifyAuthToken } from "../config/jwt.js";

const OAUTH_STATE_COOKIE = "oauth_state";

const authCookieOptions = {
  httpOnly: true,
  secure: env.nodeEnv === "production",
  sameSite: "lax" as const,
  path: "/",
};

/**
 * Start Google OAuth login.
 *
 * GET /auth/google
 *
 * Every login creates/authenticates a "local" user. A user is promoted to
 * "global" by manually updating their role in the database.
 */
export function loginWithGoogle(req: Request, res: Response) {
  // Generate OAuth state to protect against CSRF. There's no server-side
  // session to stash it in, so it round-trips through a short-lived cookie
  // instead and gets compared against the callback's query param.
  const state = crypto.randomUUID();

  res.cookie(OAUTH_STATE_COOKIE, state, {
    ...authCookieOptions,
    maxAge: 1000 * 60 * 5,
  });

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
      state !== req.cookies?.[OAUTH_STATE_COOKIE]
    ) {
      return res.status(400).json({
        message: "Invalid OAuth state.",
      });
    }

    res.clearCookie(OAUTH_STATE_COOKIE, { ...authCookieOptions });

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

    const user = await upsertLocalUser({
      googleId: payload.sub,
      email: payload.email,
      ...(payload.picture !== undefined ? { picture: payload.picture } : {}),
    });

    const token = signAuthToken({ userId: user.userId });

    res.cookie(env.authCookieName, token, {
      ...authCookieOptions,
      maxAge: 1000 * 60 * 60 * 24 * 7,
    });

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
 * Re-reads the user's row on every call instead of trusting the token's
 * payload — the JWT only carries a user id, and role is promoted by editing
 * the database directly, so an already-issued token must pick that up
 * without requiring a re-login.
 */
export async function getCurrentUser(req: Request, res: Response) {
  const token = req.cookies?.[env.authCookieName];
  const decoded = token ? verifyAuthToken(token) : null;

  if (!decoded) {
    return res.status(401).json({
      authenticated: false,
      message: "Not authenticated.",
    });
  }

  try {
    const user = await getUserById(decoded.userId);

    if (!user) {
      return res.status(401).json({
        authenticated: false,
        message: "Not authenticated.",
      });
    }

    return res.json({
      authenticated: true,
      user,
    });
  } catch (error) {
    console.error("Failed to load the current user:", error);

    return res.status(500).json({ message: "Unable to load the current user." });
  }
}

/**
 * POST /auth/logout
 *
 * The token is stateless — nothing to invalidate server-side — so logging
 * out is just discarding the cookie that carries it.
 */
export function logout(_req: Request, res: Response) {
  res.clearCookie(env.authCookieName, { ...authCookieOptions });

  return res.json({
    message: "Logged out successfully.",
  });
}

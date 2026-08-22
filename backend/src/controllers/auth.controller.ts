import crypto from "node:crypto";

import type { Request, Response } from "express";

import {
  getGoogleClient,
  getGoogleClientId,
  type GoogleNode,
} from "../services/google-auth.service.js";

function isValidNode(value: string): value is GoogleNode {
  return value === "local" || value === "global";
}

/**
 * Start Google OAuth login.
 *
 * GET /auth/google/local
 * GET /auth/google/global
 */
export function loginWithGoogle(req: Request, res: Response) {
  const { node } = req.params;

  if (typeof node !== "string" || !isValidNode(node)) {
    return res.status(400).json({
      message: "Invalid node type. Use local or global.",
    });
  }

  // Generate OAuth state to protect against CSRF.
  const state = crypto.randomUUID();

  req.session.oauthState = state;
  req.session.oauthNode = node;

  const client = getGoogleClient(node);

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
 * GET /auth/google/local/callback
 * GET /auth/google/global/callback
 */
export async function googleCallback(req: Request, res: Response) {
  try {
    const { node } = req.params;
    const { code, state } = req.query;

    // Validate node.
    if (typeof node !== "string" || !isValidNode(node)) {
      return res.status(400).json({
        message: "Invalid node type. Use local or global.",
      });
    }

    // Make sure the callback belongs to
    // the same OAuth flow that was started.
    if (req.session.oauthNode !== node) {
      return res.status(400).json({
        message: "OAuth node mismatch.",
      });
    }

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

    const client = getGoogleClient(node);

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
      audience: getGoogleClientId(node),
    });

    const payload = ticket.getPayload();

    if (!payload?.sub || !payload.email) {
      return res.status(401).json({
        message: "Unable to verify Google account.",
      });
    }

    // Store authenticated user in our application session.
    req.session.user = {
      googleId: payload.sub,
      email: payload.email,
      node,
      ...(payload.name !== undefined ? { name: payload.name } : {}),
      ...(payload.picture !== undefined ? { picture: payload.picture } : {}),
    };

    // OAuth information is no longer needed.
    delete req.session.oauthState;
    delete req.session.oauthNode;

    /*
     * Redirect the user back to Next.js.
     *
     * Later we can redirect to different dashboards
     * depending on the node/role.
     */
    return res.redirect(`${process.env.FRONTEND_URL}/dashboard`);
  } catch (error) {
    console.error("Google OAuth error:", error);

    return res.status(500).json({
      message: "Google authentication failed.",
    });
  }
}

/**
 * GET /auth/me
 */
export function getCurrentUser(req: Request, res: Response) {
  if (!req.session.user) {
    return res.status(401).json({
      authenticated: false,
      message: "Not authenticated.",
    });
  }

  return res.json({
    authenticated: true,
    user: req.session.user,
  });
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

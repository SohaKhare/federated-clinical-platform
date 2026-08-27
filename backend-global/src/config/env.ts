import "dotenv/config";

import type { UserRole } from "../auth/roles.js";

const requiredEnv = (name: string): string => {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
};

const port = Number(process.env.PORT ?? 8000);
const backendUrl = process.env.BACKEND_URL ?? `http://localhost:${port}`;

const corsOrigins = (
  process.env.CORS_ORIGINS ??
  process.env.FRONTEND_URL ??
  "http://localhost:3000"
)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

export const env = {
  port,

  nodeEnv: process.env.NODE_ENV ?? "development",

  // Reuses the existing SESSION_SECRET env var to sign JWTs, so no .env
  // changes are needed when swapping express-session out for stateless auth.
  jwt: {
    secret: requiredEnv("SESSION_SECRET"),
    expiresIn: process.env.JWT_EXPIRES_IN ?? "7d",
  },

  // Name of the httpOnly cookie the signed JWT is stored in. Override per
  // backend via .env so multiple nodes on "localhost" don't clobber each
  // other's cookie — the code itself is identical across nodes.
  authCookieName: process.env.AUTH_COOKIE_NAME ?? "fcp_token",

  // Which node this process is. A Google login handled by this server stamps
  // the authenticating user's row with this role in the shared users table,
  // so picking "Global node" on the login screen promotes the account to
  // "global" automatically — no manual database edits.
  nodeRole: (process.env.NODE_ROLE === "global"
    ? "global"
    : "local") as UserRole,

  frontendUrl: process.env.FRONTEND_URL ?? "http://localhost:3000",

  corsOrigins,

  // This server's own ML aggregator instance (same machine/LAN) — handles
  // /federation/aggregate for FedAvg once every node has checked in.
  federatedUrl: process.env.FEDERATED_URL ?? "http://localhost:8002",

  backendUrl,

  // The single local hospital node this global server talks to for now —
  // one URL, since there's no per-hospital URL registry yet. Defaults to
  // itself only for same-machine dev; set explicitly for a real split.
  localNodeUrl: process.env.LOCAL_NODE_URL ?? backendUrl,

  federationSharedSecret:
    process.env.FEDERATION_SHARED_SECRET ?? "development-federation-key",

  supabase: {
    url: requiredEnv("SUPABASE_URL"),
    serviceRoleKey: requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
  },

  google: {
    clientId: requiredEnv("LOCAL_GOOGLE_CLIENT_ID"),
    clientSecret: requiredEnv("LOCAL_GOOGLE_CLIENT_SECRET"),
    redirectUri: `${backendUrl}/auth/google/callback`,
  },

  gemini: {
    apiKey: process.env.GEMINI_API_KEY,
    model: process.env.GEMINI_MODEL ?? "gemini-2.5-flash",
  },
};

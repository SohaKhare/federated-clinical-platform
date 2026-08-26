import "dotenv/config";

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

  sessionSecret: requiredEnv("SESSION_SECRET"),

  frontendUrl: process.env.FRONTEND_URL ?? "http://localhost:3000",

  corsOrigins,

  // This node's own ML service (same machine/LAN).
  federatedUrl: process.env.FEDERATED_URL ?? "http://localhost:8001",

  backendUrl,

  // The global server's URL — this node reports training results and
  // reaches out for round bookkeeping there. Defaults to itself only for
  // same-machine dev; set explicitly once global runs elsewhere.
  globalNodeUrl: process.env.GLOBAL_NODE_URL ?? backendUrl,

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

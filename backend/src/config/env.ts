import "dotenv/config";

const requiredEnv = (name: string): string => {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
};

const port = Number(process.env.PORT ?? 5000);
const backendUrl = process.env.BACKEND_URL ?? `http://localhost:${port}`;

export const env = {
  port,

  nodeEnv: process.env.NODE_ENV ?? "development",

  sessionSecret: requiredEnv("SESSION_SECRET"),

  frontendUrl: process.env.FRONTEND_URL ?? "http://localhost:3000",

  databaseUrl: requiredEnv("DATABASE_URL"),

  google: {
    clientId: requiredEnv("LOCAL_GOOGLE_CLIENT_ID"),
    clientSecret: requiredEnv("LOCAL_GOOGLE_CLIENT_SECRET"),
    redirectUri: `${backendUrl}/auth/google/callback`,
  },
};

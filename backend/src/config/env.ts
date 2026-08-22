import "dotenv/config";

const requiredEnv = (name: string): string => {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
};

export const env = {
  port: Number(process.env.PORT ?? 5000),

  nodeEnv: process.env.NODE_ENV ?? "development",

  sessionSecret: requiredEnv("SESSION_SECRET"),

  frontendUrl: process.env.FRONTEND_URL ?? "http://localhost:3000",

  localGoogle: {
    clientId: requiredEnv("LOCAL_GOOGLE_CLIENT_ID"),
    clientSecret: requiredEnv("LOCAL_GOOGLE_CLIENT_SECRET"),
    redirectUri: "http://localhost:5000/auth/google/local/callback",
  },

  globalGoogle: {
    clientId: requiredEnv("GLOBAL_GOOGLE_CLIENT_ID"),
    clientSecret: requiredEnv("GLOBAL_GOOGLE_CLIENT_SECRET"),
    redirectUri: "http://localhost:5000/auth/google/global/callback",
  },
};

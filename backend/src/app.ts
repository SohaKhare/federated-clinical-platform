import express from "express";
import cors from "cors";
import session from "express-session";
import authRoutes from "./routes/auth.routes.js";
import { env } from "./config/env.js";

const app = express();

app.use(
  cors({
    origin: env.frontendUrl,
    credentials: true,
  }),
);

app.use(express.json());

app.use(
  session({
    secret: env.sessionSecret,

    resave: false,

    saveUninitialized: false,

    cookie: {
      httpOnly: true,

      secure: env.nodeEnv === "production",

      sameSite: "lax",

      maxAge: 1000 * 60 * 60 * 24,
    },
  }),
);

app.get("/", (_req, res) => {
  res.json({
    message: "Federated Clinical Platform API",
    status: "running",
  });
});

app.get("/health", (_req, res) => {
  res.json({
    status: "healthy",
    service: "backend",
  });
});

app.use("/auth", authRoutes);

export default app;

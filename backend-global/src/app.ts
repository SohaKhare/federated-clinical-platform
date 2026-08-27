import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import authRoutes from "./routes/auth.routes.js";
import demoRoutes from "./routes/demo.routes.js";
import { env } from "./config/env.js";
import nodeRoutes from "./routes/node.routes.js";
import logRoutes from "./routes/log.routes.js";
import globalFederatedRoutes from "./routes/global-federated.routes.js";
import activityLogRoutes from "./routes/activity-log.routes.js";

const app = express();

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || env.corsOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  }),
);

app.use(express.json());

// Auth is a stateless signed JWT stored in an httpOnly cookie — no
// server-side session store, so nothing to lose on a restart.
app.use(cookieParser());

app.get("/", (_req, res) => {
  res.json({
    message: "Federated Clinical Platform API — global node",
    status: "running",
  });
});

app.get("/health", (_req, res) => {
  res.json({
    status: "healthy",
    service: "backend-global",
  });
});

// Registered as this node's OAuth redirect URI in the Google Cloud Console —
// stays unprefixed so login doesn't break.
app.use("/auth", authRoutes);

app.use("/global/api", demoRoutes);

app.use("/global/nodes", nodeRoutes);

app.use("/global/logs", logRoutes);

app.use("/global/api/federated", globalFederatedRoutes);

app.use("/global/activity", activityLogRoutes);

export default app;

import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import authRoutes from "./routes/auth.routes.js";
import demoRoutes from "./routes/demo.routes.js";
import { env } from "./config/env.js";
import patientRoutes from "./routes/patient.routes.js";
import logRoutes from "./routes/log.routes.js";
import researchRoutes from "./routes/research.routes.js";
import privacyRoutes from "./routes/privacy.routes.js";
import federatedRoutes from "./routes/federated.routes.js";
import modelRoutes from "./routes/model.routes.js";

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

// The federation callback can carry a small metrics/status_path JSON body;
// keep the default express.json() limit generous enough for that.
app.use(express.json({ limit: "10mb" }));

// Auth is a stateless signed JWT stored in an httpOnly cookie — no
// server-side session store, so nothing to lose on a restart.
app.use(cookieParser());

app.get("/", (_req, res) => {
  res.json({
    message: "Federated Clinical Platform API — local node",
    status: "running",
  });
});

app.get("/health", (_req, res) => {
  res.json({
    status: "healthy",
    service: "backend-local",
  });
});

// Registered as this node's OAuth redirect URI in the Google Cloud Console —
// stays unprefixed so login doesn't break.
app.use("/auth", authRoutes);

app.use("/local/patients", patientRoutes);

app.use("/local/api", demoRoutes);

app.use("/local/logs", logRoutes);

app.use("/local/research", researchRoutes);

app.use("/local/privacy", privacyRoutes);

app.use("/local/federated", federatedRoutes);

app.use("/local/model", modelRoutes);

export default app;

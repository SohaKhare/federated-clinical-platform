import express from "express";
import cors from "cors";
import session from "express-session";
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

app.use("/auth", authRoutes);

app.use("/patients", patientRoutes);

app.use("/api", demoRoutes);

app.use("/logs", logRoutes);

app.use("/research", researchRoutes);

app.use("/privacy", privacyRoutes);

app.use("/federated", federatedRoutes);

app.use("/model", modelRoutes);

export default app;

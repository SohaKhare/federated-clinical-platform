import express from "express";
import cors from "cors";
import session from "express-session";
import authRoutes from "./routes/auth.routes.js";
import demoRoutes from "./routes/demo.routes.js";
import { env } from "./config/env.js";
import patientRoutes from "./routes/patient.routes.js";
import nodeRoutes from "./routes/node.routes.js";
import logRoutes from "./routes/log.routes.js";
const app = express();
app.use(cors({
    origin: (origin, callback) => {
        if (!origin || env.corsOrigins.includes(origin)) {
            return callback(null, true);
        }
        return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
}));
app.use(express.json());
app.use(session({
    secret: env.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        secure: env.nodeEnv === "production",
        sameSite: "lax",
        maxAge: 1000 * 60 * 60 * 24,
    },
}));
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
app.use("/patients", patientRoutes);
app.use("/nodes", nodeRoutes);
app.use("/logs", logRoutes);
app.use("/api", demoRoutes);
export default app;
//# sourceMappingURL=app.js.map
import { Router } from "express";
import multer, { type FileFilterCallback } from "multer";
import type { NextFunction, Request, Response } from "express";

import {
  createPatient,
  getPatients,
  getPatientById,
  getPatientEvents,
  addPatientEvent,
  updatePatient,
  getPresentationBatch,
} from "../controllers/local-node/patient.controller.js";
import { extractPatientFromReport } from "../controllers/local-node/ocr.controller.js";
import { predictPatient } from "../controllers/local-node/predict.controller.js";
import { requireAuth, requireRole } from "../middleware/auth.middleware.js";

const ACCEPTED_REPORT_MIME = /^(image\/(png|jpe?g|webp|bmp|tiff)|application\/pdf)$/;
const MAX_REPORTS = 10;

const reportUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: MAX_REPORTS },
  fileFilter: (_req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
    if (ACCEPTED_REPORT_MIME.test(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new Error(
          "Unsupported file type. Upload PNG, JPG, WEBP, BMP, TIFF, or PDF reports.",
        ),
      );
    }
  },
});

/**
 * Wraps the multer upload so upload errors (bad type, too large, too many)
 * become 400 JSON responses instead of falling through to Express' default
 * HTML error page. Accepts up to MAX_REPORTS files in the `reports` field.
 */
function uploadReports(req: Request, res: Response, next: NextFunction) {
  reportUpload.array("reports", MAX_REPORTS)(req, res, (error: unknown) => {
    if (error && typeof error === "object" && "code" in error) {
      const multerError = error as { code?: string; message?: string };

      if (multerError.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({
          message: "A report is too large. Maximum size is 10 MB per file.",
        });
      }

      if (multerError.code === "LIMIT_FILE_COUNT") {
        return res.status(400).json({
          message: `Too many reports. Upload at most ${MAX_REPORTS} at once.`,
        });
      }

      return res.status(400).json({
        message: `Upload failed: ${multerError.message ?? "Unknown upload error."}`,
      });
    }

    if (error instanceof Error) {
      return res.status(400).json({ message: error.message });
    }

    next();
  });
}

const router = Router();

router.use(requireAuth, requireRole("local"));

router.get("/", getPatients);

router.get("/presentation-batch", getPresentationBatch);

router.post("/predict", predictPatient);

router.post("/", createPatient);

router.post("/ocr", uploadReports, extractPatientFromReport);

router.get("/:id/events", getPatientEvents);

router.post("/:id/events", addPatientEvent);

router.patch("/:id", updatePatient);

router.get("/:id", getPatientById);

export default router;

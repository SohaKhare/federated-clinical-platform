import type { Request, Response } from "express";
import type { File as MulterFile } from "multer";

import {
  extractPatientFromReport as extractPatientFromReportRecord,
  OcrConfigurationError,
  type PatientOcrDraft,
} from "../../services/local-node-service/ocr.service.js";

interface ReportResult {
  filename: string;
  draft: PatientOcrDraft | null;
  warnings: string[];
  error?: string;
}

export async function extractPatientFromReport(req: Request, res: Response) {
  const files = (req.files as MulterFile[] | undefined) ?? [];

  if (files.length === 0) {
    return res.status(400).json({
      message:
        "No reports uploaded. Attach one or more images/PDFs as the 'reports' form field.",
    });
  }

  try {
    const results: ReportResult[] = await Promise.all(
      files.map(async (file): Promise<ReportResult> => {
        try {
          const { draft, warnings } = await extractPatientFromReportRecord(
            file.buffer,
            file.mimetype,
          );

          return { filename: file.originalname, draft, warnings };
        } catch (error) {
          // A missing API key affects every file — rethrow so the whole
          // request fails as 503 rather than reporting it per file.
          if (error instanceof OcrConfigurationError) {
            throw error;
          }

          console.error(`Report OCR error for ${file.originalname}:`, error);

          return {
            filename: file.originalname,
            draft: null,
            warnings: [],
            error: "Unable to extract patient data from this report.",
          };
        }
      }),
    );

    return res.json({ results });
  } catch (error) {
    if (error instanceof OcrConfigurationError) {
      console.error("OCR configuration error:", error.message);

      return res.status(503).json({ message: error.message });
    }

    console.error("Report OCR error:", error);

    return res.status(500).json({
      message: "Unable to extract patient data from the uploaded reports.",
    });
  }
}

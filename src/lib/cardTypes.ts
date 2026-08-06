/**
 * The shape of a card that has been read.
 *
 * Deliberately separate from `cardApi.ts`, which is `server-only`: these types
 * are needed by the upload UI, which runs in the browser. Types are erased at
 * build time, but keeping them in their own module means a client component
 * can never reach the fetch code by following an import.
 *
 * Kept in step with `backend/soil_report.py` and `backend/document_service.py`.
 */

/** Matches `METRIC_KEYS` in `backend/soil_report.py`, in the order a card prints. */
export type MetricKey =
  | "available_boron"
  | "available_nitrogen"
  | "available_phosphorus"
  | "available_potassium"
  | "ph"
  | "ec"
  | "organic_carbon"
  | "available_sulphur"
  | "available_zinc"
  | "available_iron"
  | "available_manganese"
  | "available_copper";

export type StatusCode = "low" | "normal" | "high";

export type ExtractedMetric = {
  key: MetricKey;
  label: string;
  reading: number;
  reading_display: string;
  range_min: number;
  range_max: number;
  range_display: string;
  status: string;
  status_code: StatusCode;
  /**
   * `unconfirmed` means the number came out of OCR rather than a PDF's text
   * layer, and the UI must say so. Not a formality: on a clean render of the
   * test card Tesseract turns nitrogen 245.15 into 945.15, which flips the
   * advice from "apply urea" to "apply none".
   */
  confidence: "high" | "unconfirmed";
};

export type CropSuggestion = {
  name: string;
  score: number;
  confidence: number;
  reason: string;
};

export type CardReadResult = {
  id: string;
  filename: string;
  size: number;
  /** "native" = read from the PDF's text layer. "ocr" = recovered from pixels. */
  source: "native" | "ocr";
  ocr_pages: number[];
  /** True when any reading came from OCR and therefore needs a human check. */
  needs_review: boolean;
  page_count: number;
  chunk_count: number;
  soil_metrics: ExtractedMetric[];
  missing_metrics: MetricKey[];
  metric_count: number;
  out_of_range_count: number;
  summary: string;
  predictions: {
    soil_health: {
      label: string;
      score: number;
      summary: string;
      flagged_metrics: string[];
    };
    recommended_crop: CropSuggestion;
    alternative_crops: CropSuggestion[];
    fertilizer_plan: {
      title: string;
      status: StatusCode;
      metric: string;
      action: string;
    }[];
    input_coverage: { metrics_found: number; metrics_flagged: number };
  };
};

/** Why a read failed, in terms the upload UI can turn into advice. */
export type CardErrorKind =
  | "unsupported" // wrong file type or too big
  | "unreadable" // we got the file but no text came out of it
  | "no-readings" // text came out, but none of the twelve were in it
  | "offline" // the reading service is not answering
  | "unknown";

/** What `/api/card` returns when a read fails. Both languages, always. */
export type CardErrorBody = {
  error: CardErrorKind;
  message: { mr: string; en: string };
  detail?: string;
};

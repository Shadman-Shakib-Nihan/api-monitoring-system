/**
 * Generates AI_Prompts.docx — a Word document describing the AI explanation
 * prompts used by the monitoring system (system prompt, user prompt shape,
 * output schema, fallback behaviour, and configuration).
 *
 * Run: npm run generate:prompts-doc
 * Output: AI_Prompts.docx (repo root)
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { AlignmentType, Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import { SYSTEM_PROMPT } from "../src/services/ai.js";

function h1(text: string) {
  return new Paragraph({ heading: HeadingLevel.HEADING_1, text });
}

function p(text: string) {
  return new Paragraph({ text });
}

function bullet(text: string) {
  return new Paragraph({ text, bullet: { level: 0 } });
}

function code(text: string) {
  return new Paragraph({
    children: [new TextRun({ text, font: "Courier New" })],
    spacing: { before: 60, after: 60 },
  });
}

const USER_PROMPT_SHAPE = `Monitoring findings to explain:
{
  "api_name": "<string>",
  "severity_assigned_by_rules": "WARNING | CRITICAL",
  "observed": {
    "http_status_code": <int>,
    "response_time_ms": <int>,
    "records_returned": <int>
  },
  "findings": [
    {
      "anomaly_type": "<string>",
      "severity": "WARNING | CRITICAL",
      "observed": <number|string>,
      "expected": "<string>",
      "evidence": "<string>"
    }
  ]
}`;

const OUTPUT_SCHEMA = `{
  "title":               string  (1..140 chars),
  "summary":             string  (1..2000 chars),
  "likely_cause":        string  (1..1500 chars, must be labeled as a hypothesis),
  "suggested_actions":   string[] (1..8 items, each 1..500 chars, ordered),
  "severity_explanation": string (1..1500 chars)
}`;

const doc = new Document({
  title: "AI Prompts — Intelligent API Monitoring & Alert System",
  creator: "API Monitoring System",
  sections: [
    {
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: "AI Prompts", bold: true, size: 48 })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({
              text: "Intelligent API Monitoring & Alert System — Gemini explanation service",
              size: 24,
            }),
          ],
        }),

        h1("1. Purpose"),
        p(
          "The system evaluates API observations with deterministic rules first. " +
            "Severity is ALWAYS assigned by those rules. The AI explainer is used only to " +
            "produce a human-readable explanation (title, summary, likely cause, suggested " +
            "actions, severity rationale) for brand-new alerts. If the AI explainer fails or " +
            "is unavailable, a deterministic fallback explanation is generated so an alert is " +
            "never lost.",
        ),

        h1("2. Provider and model"),
        bullet("Provider: Google Gemini (the only AI provider wired in this project)."),
        bullet("Client: @google/genai"),
        bullet(
          "Model: configurable via GEMINI_MODEL (project default: gemini-3.8-flash).",
        ),
        bullet(
          "Request format: application/json response MIME type + JSON schema constraint.",
        ),
        bullet("thinkingConfig.thinkingBudget = 0 (latency optimisation)."),
        bullet("temperature = 0.2, maxOutputTokens = 1200."),
        bullet(
          "Timeout: AI_TIMEOUT_MS (default 15000 ms). On timeout/error the fallback explainer is used.",
        ),

        h1("3. System prompt"),
        p("The following system prompt is sent with every explanation request:"),
        code(SYSTEM_PROMPT),

        h1("4. User prompt"),
        p(
          "The user prompt contains only operational metadata derived from the observation " +
            "and the rule findings. No logs, no infrastructure details, and no personal data " +
            "are sent. Shape:",
        ),
        code(USER_PROMPT_SHAPE),

        h1("5. Required output schema"),
        p(
          "The model must return strictly valid JSON matching this schema (Zod-validated):",
        ),
        code(OUTPUT_SCHEMA),

        h1("6. Guardrails"),
        bullet("The model must not invent events, logs, deployments, or root causes."),
        bullet(
          "Likely cause MUST be labeled as a hypothesis; it is never stated as confirmed.",
        ),
        bullet("Severity is never changed or overridden by the model."),
        bullet("No patient data, personal names, medical records, or credentials."),
        bullet(
          "Any schema violation or transport error triggers the deterministic fallback.",
        ),

        h1("7. Deterministic fallback"),
        p(
          "When GEMINI_API_KEY is absent, or the AI call fails/times out/returns invalid " +
            "JSON, the FallbackAlertExplainer builds the same five fields from the rule " +
            "findings. The alert is tagged source: FALLBACK and the likely cause is prefixed " +
            "with 'Hypothesis (rule-based heuristic, AI explainer unavailable)'. AI-capped " +
            "calls per batch are enforced (AI_MAX_CALLS_PER_BATCH) with concurrency limited " +
            "to AI_MAX_CONCURRENT, so repeated observations of the same fingerprint consume " +
            "no further AI budget.",
        ),

        h1("8. Configuration reference"),
        bullet("GEMINI_API_KEY — optional; empty means fallback-only mode."),
        bullet("GEMINI_MODEL — model id used for explanations."),
        bullet("AI_TIMEOUT_MS — per-call timeout before falling back."),
        bullet("AI_MAX_CONCURRENT — max simultaneous Gemini calls in a batch."),
        bullet("AI_MAX_CALLS_PER_BATCH — max AI explanations per /monitor batch."),
      ],
    },
  ],
});

const OUT = path.resolve(process.cwd(), "..", "AI_Prompts.docx");

Packer.toBuffer(doc)
  .then((buffer: Buffer) => {
    writeFileSync(OUT, buffer);
    console.log(`Wrote ${OUT}`);
  })
  .catch((err: unknown) => {
    console.error("Failed to generate AI_Prompts.docx:", err);
    process.exitCode = 1;
  });

import { z } from "zod";

export const observationSchema = z.object({
  api_name: z.string().trim().min(1).max(200),
  response_time_ms: z.number().int().min(0).max(3_600_000),
  status_code: z.number().int().min(100).max(599),
  records_returned: z.number().int().min(0),
  observed_at: z.string().datetime({ offset: true }).optional(),
});

export type ValidatedObservation = z.output<typeof observationSchema>;

/**
 * Accepts either a single observation object or `{ observations: [...] }`.
 * Batch size is capped at maxBatchSize.
 */
export function createMonitorBodySchema(maxBatchSize: number) {
  return z.preprocess(
    (body) => {
      if (
        body &&
        typeof body === "object" &&
        !Array.isArray(body) &&
        "observations" in body
      ) {
        return body;
      }
      if (body && typeof body === "object" && !Array.isArray(body)) {
        return { observations: [body] };
      }
      return body;
    },
    z.object({
      observations: z.array(observationSchema).min(1).max(maxBatchSize),
    }),
  );
}

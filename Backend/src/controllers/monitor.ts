import type { Request, Response } from "express";
import { config } from "../config/index.js";
import { prisma } from "../db/prisma.js";
import { processObservations } from "../services/monitor.js";
import type { ApiObservation } from "../monitoring/types.js";
import {
  createMonitorBodySchema,
  type ValidatedObservation,
} from "../validators/monitor.js";

export async function monitorController(req: Request, res: Response): Promise<void> {
  const schema = createMonitorBodySchema(config.limits.maxBatchSize);
  const parsed = schema.parse(req.body);
  const observations: ApiObservation[] = parsed.observations.map(
    (o: ValidatedObservation): ApiObservation => ({
      api_name: o.api_name,
      response_time_ms: o.response_time_ms,
      status_code: o.status_code,
      records_returned: o.records_returned,
      ...(o.observed_at ? { observed_at: o.observed_at } : {}),
    }),
  );

  const result = await processObservations(prisma, observations);
  res.status(200).json({ status: "ok", ...result });
}

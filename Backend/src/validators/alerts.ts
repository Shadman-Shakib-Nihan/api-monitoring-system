import { z } from "zod";

export const listAlertsQuerySchema = z.object({
  status: z.enum(["ACTIVE", "RESOLVED"]).optional(),
  severity: z.enum(["WARNING", "CRITICAL"]).optional(),
  apiName: z.string().trim().min(1).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export const alertIdParamSchema = z.object({
  id: z.string().trim().min(1).max(100),
});

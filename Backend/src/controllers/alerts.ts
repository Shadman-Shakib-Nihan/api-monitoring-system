import type { Request, Response } from "express";
import { prisma } from "../db/prisma.js";
import { getAlertById, listAlerts, resolveAlert } from "../services/alerts.js";
import { alertIdParamSchema, listAlertsQuerySchema } from "../validators/alerts.js";

export async function listAlertsController(req: Request, res: Response): Promise<void> {
  const query = listAlertsQuerySchema.parse(req.query);
  const result = await listAlerts(prisma, query);
  res.status(200).json({
    status: "ok",
    total: result.total,
    alerts: result.items,
  });
}

export async function getAlertController(req: Request, res: Response): Promise<void> {
  const { id } = alertIdParamSchema.parse(req.params);
  const alert = await getAlertById(prisma, id);
  if (!alert) {
    res.status(404).json({ status: "error", message: "Alert not found" });
    return;
  }
  res.status(200).json({ status: "ok", alert });
}

export async function resolveAlertController(req: Request, res: Response): Promise<void> {
  const { id } = alertIdParamSchema.parse(req.params);
  const alert = await resolveAlert(prisma, id);
  if (!alert) {
    res.status(404).json({ status: "error", message: "Alert not found" });
    return;
  }
  res.status(200).json({ status: "ok", alert });
}

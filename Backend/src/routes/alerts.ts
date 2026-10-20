import { Router } from "express";
import {
  getAlertController,
  listAlertsController,
  resolveAlertController,
} from "../controllers/alerts.js";
import { asyncHandler } from "../middleware/errorHandler.js";

export const alertsRouter = Router();

alertsRouter.get("/", asyncHandler(listAlertsController));
alertsRouter.get("/:id", asyncHandler(getAlertController));
alertsRouter.patch("/:id/resolve", asyncHandler(resolveAlertController));

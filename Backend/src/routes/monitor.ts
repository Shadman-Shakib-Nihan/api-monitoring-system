import { Router } from "express";
import { monitorController } from "../controllers/monitor.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { monitorRateLimiter } from "../middleware/rateLimit.js";

export const monitorRouter = Router();

monitorRouter.post("/", monitorRateLimiter, asyncHandler(monitorController));

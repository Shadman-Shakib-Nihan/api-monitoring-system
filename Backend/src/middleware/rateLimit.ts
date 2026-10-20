import rateLimit from "express-rate-limit";
import { config } from "../config/index.js";

export function createRateLimiter(max: number, windowMs: number, message: string) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
      res.status(429).json({
        status: "error",
        message,
      });
    },
  });
}

export const globalRateLimiter = createRateLimiter(
  config.rateLimit.max,
  config.rateLimit.windowMs,
  "Too many requests, please try again later.",
);

export const monitorRateLimiter = createRateLimiter(
  config.rateLimit.monitorMax,
  config.rateLimit.windowMs,
  "Too many monitoring submissions, please slow down.",
);

import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";
import { config } from "../config/index.js";
import { logger } from "../logger.js";

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({
    status: "error",
    message: "Route not found",
    path: req.originalUrl,
  });
};

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (res.headersSent) {
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      status: "error",
      message: "Validation failed",
      details: err.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    });
    return;
  }

  const bodyErr = err as { type?: string; status?: number; statusCode?: number; message?: string };

  if (bodyErr.type === "entity.too.large") {
    res.status(413).json({
      status: "error",
      message: "Request body too large",
    });
    return;
  }

  if (bodyErr.type === "entity.parse.failed") {
    res.status(400).json({
      status: "error",
      message: "Invalid JSON in request body",
    });
    return;
  }

  const rawStatus = bodyErr.status ?? bodyErr.statusCode;
  const status = typeof rawStatus === "number" && rawStatus >= 400 && rawStatus < 500 ? rawStatus : 500;

  if (status < 500) {
    logger.warn(
      { err: bodyErr.message, path: req.originalUrl, method: req.method },
      "Request failed",
    );
    res.status(status).json({
      status: "error",
      message: bodyErr.message ?? "Bad request",
    });
    return;
  }

  logger.error({ err, path: req.originalUrl, method: req.method }, "Unhandled error");
  res.status(500).json({
    status: "error",
    message: "Internal server error",
    ...(config.nodeEnv !== "production" && bodyErr.message
      ? { details: bodyErr.message }
      : {}),
  });
};

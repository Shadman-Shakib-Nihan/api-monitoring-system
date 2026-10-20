import express from "express";
import helmet from "helmet";
import cors from "cors";
import { pinoHttp } from "pino-http";
import { config } from "./config/index.js";
import { logger } from "./logger.js";
import { globalRateLimiter } from "./middleware/rateLimit.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { monitorRouter } from "./routes/monitor.js";
import { alertsRouter } from "./routes/alerts.js";

export const app = express();

app.use(helmet());

app.use(cors({ origin: config.corsOrigins }));

app.use(
  pinoHttp({
    logger,
    autoLogging: config.nodeEnv !== "test",
  }),
);

app.use(express.json({ limit: config.limits.maxBodySizeBytes }));

app.use(globalRateLimiter);

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    message: "API Monitoring Backend is running",
  });
});

app.use("/monitor", monitorRouter);
app.use("/alerts", alertsRouter);

app.use(notFoundHandler);
app.use(errorHandler);

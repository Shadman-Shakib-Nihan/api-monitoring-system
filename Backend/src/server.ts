import express from "express";
import helmet from "helmet";
import cors from "cors";
import { pinoHttp } from "pino-http";
import { config } from "./config/index.js";
import { logger } from "./logger.js";
import { globalRateLimiter } from "./middleware/rateLimit.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";

const app = express();

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

app.use(notFoundHandler);
app.use(errorHandler);

app.listen(config.port, config.host, () => {
  logger.info(
    { port: config.port, host: config.host, nodeEnv: config.nodeEnv },
    `Server running at http://localhost:${config.port}`,
  );
});

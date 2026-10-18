import express from "express";
import dotenv from "dotenv";
import helmet from "helmet";
import cors from "cors";
import { config } from "./config/index.js";
import { logger } from "./logger.js";

console.log(config.port, config.thresholds.warningMs);
logger.info("config + logger OK");
dotenv.config();

const app = express();

app.use(helmet());

app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "http://localhost:5173",
  })
);

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    message: "API Monitoring Backend is running",
  });
});

app.use((_req, res) => {
  res.status(404).json({
    status: "error",
    message: "Route not found",
  });
});

const port = Number(process.env.PORT) || 4000;
const host = process.env.HOST || "0.0.0.0";

app.listen(port, host, () => {
  console.log(`Server running at http://localhost:${port}`);
  console.log(`Listening on ${host}:${port}`);
});
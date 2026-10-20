import pino from "pino";
import { config } from "./config/index.js";

export const logger = pino({
  level: config.nodeEnv === "test" ? "silent" : config.logLevel,
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "headers.authorization",
      "apiKey",
      "OPENAI_API_KEY",
      "GEMINI_API_KEY",
      "*.apiKey",
    ],
    remove: true,
  },
  ...(config.nodeEnv === "development"
    ? {
        transport: {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "HH:MM:ss", ignore: "pid,hostname" },
        },
      }
    : {}),
});

export type Logger = typeof logger;

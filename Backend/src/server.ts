import { app } from "./app.js";
import { config } from "./config/index.js";
import { logger } from "./logger.js";

app.listen(config.port, config.host, () => {
  logger.info(
    { port: config.port, host: config.host, nodeEnv: config.nodeEnv },
    `Server running at http://localhost:${config.port}`,
  );
});

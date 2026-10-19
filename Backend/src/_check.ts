import { createExplainer } from "./services/ai.js";
import { evaluateObservation } from "./monitoring/rules.js";
import { config } from "./config/index.js";

const result = evaluateObservation(
  { api_name: "AppointmentAPI", response_time_ms: 5500, status_code: 500, records_returned: 0 },
  { warningMs: config.thresholds.warningMs, criticalMs: config.thresholds.criticalMs, emptyResultAllowedApis: config.thresholds.emptyResultAllowedApis },
);

createExplainer(config).explain(result).then(r => {
  console.log("source:", r.source);
  console.log("title:", r.explanation.title);
  console.log("hypothesis:", r.explanation.likely_cause.slice(0, 80));
});
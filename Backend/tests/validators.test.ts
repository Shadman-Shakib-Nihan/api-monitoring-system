import { describe, expect, it } from "vitest";
import {
  createMonitorBodySchema,
  observationSchema,
} from "../src/validators/monitor.js";
import {
  alertIdParamSchema,
  listAlertsQuerySchema,
} from "../src/validators/alerts.js";

const validObservation = {
  api_name: "AppointmentAPI",
  response_time_ms: 1200,
  status_code: 200,
  records_returned: 5,
};

describe("observationSchema", () => {
  it("accepts a valid observation", () => {
    const parsed = observationSchema.parse(validObservation);
    expect(parsed.api_name).toBe("AppointmentAPI");
  });

  it("accepts an optional observed_at ISO timestamp", () => {
    const parsed = observationSchema.parse({
      ...validObservation,
      observed_at: "2026-10-20T10:00:00.000Z",
    });
    expect(parsed.observed_at).toBe("2026-10-20T10:00:00.000Z");
  });

  it("rejects a non-ISO observed_at", () => {
    expect(() =>
      observationSchema.parse({ ...validObservation, observed_at: "yesterday" }),
    ).toThrow();
  });

  it("rejects an empty api_name", () => {
    expect(() =>
      observationSchema.parse({ ...validObservation, api_name: "  " }),
    ).toThrow();
  });

  it("rejects out-of-range status codes", () => {
    expect(() =>
      observationSchema.parse({ ...validObservation, status_code: 99 }),
    ).toThrow();
    expect(() =>
      observationSchema.parse({ ...validObservation, status_code: 600 }),
    ).toThrow();
    expect(() =>
      observationSchema.parse({ ...validObservation, status_code: 100 }),
    ).not.toThrow();
    expect(() =>
      observationSchema.parse({ ...validObservation, status_code: 599 }),
    ).not.toThrow();
  });

  it("rejects negative or non-integer numbers", () => {
    expect(() =>
      observationSchema.parse({ ...validObservation, response_time_ms: -1 }),
    ).toThrow();
    expect(() =>
      observationSchema.parse({ ...validObservation, records_returned: -1 }),
    ).toThrow();
    expect(() =>
      observationSchema.parse({ ...validObservation, response_time_ms: 1.5 }),
    ).toThrow();
  });

  it("rejects missing fields", () => {
    expect(() =>
      observationSchema.parse({ api_name: "X" }),
    ).toThrow();
  });
});

describe("createMonitorBodySchema", () => {
  const schema = createMonitorBodySchema(50);

  it("wraps a single observation object into an observations array", () => {
    const parsed = schema.parse(validObservation);
    expect(parsed.observations).toHaveLength(1);
    expect(parsed.observations[0]?.api_name).toBe("AppointmentAPI");
  });

  it("accepts a batch", () => {
    const parsed = schema.parse({
      observations: [validObservation, { ...validObservation, api_name: "B" }],
    });
    expect(parsed.observations).toHaveLength(2);
  });

  it("rejects an empty batch", () => {
    expect(() => schema.parse({ observations: [] })).toThrow();
  });

  it("rejects a batch larger than maxBatchSize", () => {
    const small = createMonitorBodySchema(2);
    expect(() =>
      small.parse({
        observations: [validObservation, validObservation, validObservation],
      }),
    ).toThrow(/at most 2/);
  });

  it("rejects a top-level array body", () => {
    expect(() => schema.parse([validObservation])).toThrow();
  });

  it("rejects a non-object body", () => {
    expect(() => schema.parse("nope")).toThrow();
    expect(() => schema.parse(null)).toThrow();
  });

  it("propagates observation-level errors inside a batch", () => {
    expect(() =>
      schema.parse({
        observations: [validObservation, { ...validObservation, status_code: 999 }],
      }),
    ).toThrow();
  });
});

describe("listAlertsQuerySchema", () => {
  it("accepts valid filters and coerces numeric strings", () => {
    const parsed = listAlertsQuerySchema.parse({
      status: "ACTIVE",
      severity: "CRITICAL",
      apiName: "AppointmentAPI",
      limit: "25",
      offset: "50",
    });
    expect(parsed).toEqual({
      status: "ACTIVE",
      severity: "CRITICAL",
      apiName: "AppointmentAPI",
      limit: 25,
      offset: 50,
    });
  });

  it("accepts an empty query", () => {
    expect(listAlertsQuerySchema.parse({})).toEqual({});
  });

  it("rejects invalid status/severity values", () => {
    expect(() => listAlertsQuerySchema.parse({ status: "BOGUS" })).toThrow();
    expect(() => listAlertsQuerySchema.parse({ severity: "high" })).toThrow();
  });

  it("enforces limit bounds 1..200", () => {
    expect(() => listAlertsQuerySchema.parse({ limit: "0" })).toThrow();
    expect(() => listAlertsQuerySchema.parse({ limit: "201" })).toThrow();
    expect(() => listAlertsQuerySchema.parse({ limit: "200" })).not.toThrow();
  });

  it("rejects a negative offset", () => {
    expect(() => listAlertsQuerySchema.parse({ offset: "-1" })).toThrow();
  });
});

describe("alertIdParamSchema", () => {
  it("accepts a normal id", () => {
    const parsed = alertIdParamSchema.parse({ id: "cmvgs1k8r0000xphzu81yechy" });
    expect(parsed.id).toBe("cmvgs1k8r0000xphzu81yechy");
  });

  it("rejects an empty id", () => {
    expect(() => alertIdParamSchema.parse({ id: "" })).toThrow();
    expect(() => alertIdParamSchema.parse({ id: "   " })).toThrow();
  });

  it("rejects an over-long id", () => {
    expect(() => alertIdParamSchema.parse({ id: "x".repeat(101) })).toThrow();
  });
});

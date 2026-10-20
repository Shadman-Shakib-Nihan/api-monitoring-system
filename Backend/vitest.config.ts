import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Integration tests spawn a Prisma migrate + server against a temp DB,
    // so give them a little more room than the unit suites.
    testTimeout: 20_000,
    hookTimeout: 60_000,
    // Each file sets its own DATABASE_URL before importing Prisma; run files
    // in isolated processes so env does not leak between suites.
    isolate: true,
    pool: "forks",
  },
});

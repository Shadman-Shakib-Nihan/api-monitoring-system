-- CreateTable
CREATE TABLE "Alert" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "apiName" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'warning',
    "status" INTEGER NOT NULL,
    "responseTimeMs" INTEGER NOT NULL,
    "recordCount" INTEGER,
    "message" TEXT NOT NULL,
    "aiExplanation" TEXT,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "Alert_createdAt_idx" ON "Alert"("createdAt");

-- CreateIndex
CREATE INDEX "Alert_severity_resolved_idx" ON "Alert"("severity", "resolved");

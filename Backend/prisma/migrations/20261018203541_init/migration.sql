/*
  Warnings:

  - You are about to drop the column `aiExplanation` on the `Alert` table. All the data in the column will be lost.
  - You are about to drop the column `endpoint` on the `Alert` table. All the data in the column will be lost.
  - You are about to drop the column `message` on the `Alert` table. All the data in the column will be lost.
  - You are about to drop the column `recordCount` on the `Alert` table. All the data in the column will be lost.
  - You are about to drop the column `resolved` on the `Alert` table. All the data in the column will be lost.
  - Added the required column `anomalyTypes` to the `Alert` table without a default value. This is not possible if the table is not empty.
  - Added the required column `evidence` to the `Alert` table without a default value. This is not possible if the table is not empty.
  - Added the required column `fingerprint` to the `Alert` table without a default value. This is not possible if the table is not empty.
  - Added the required column `likelyCause` to the `Alert` table without a default value. This is not possible if the table is not empty.
  - Added the required column `severityExplanation` to the `Alert` table without a default value. This is not possible if the table is not empty.
  - Added the required column `source` to the `Alert` table without a default value. This is not possible if the table is not empty.
  - Added the required column `suggestedActions` to the `Alert` table without a default value. This is not possible if the table is not empty.
  - Added the required column `summary` to the `Alert` table without a default value. This is not possible if the table is not empty.
  - Added the required column `title` to the `Alert` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Alert" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "apiName" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "anomalyTypes" TEXT NOT NULL,
    "statusCode" INTEGER,
    "responseTimeMs" INTEGER,
    "recordsReturned" INTEGER,
    "evidence" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "likelyCause" TEXT NOT NULL,
    "suggestedActions" TEXT NOT NULL,
    "severityExplanation" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "fingerprint" TEXT NOT NULL,
    "occurrenceCount" INTEGER NOT NULL DEFAULT 1,
    "lastObservedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "resolvedAt" DATETIME
);
INSERT INTO "new_Alert" ("apiName", "createdAt", "id", "responseTimeMs", "severity", "status", "updatedAt") SELECT "apiName", "createdAt", "id", "responseTimeMs", "severity", "status", "updatedAt" FROM "Alert";
DROP TABLE "Alert";
ALTER TABLE "new_Alert" RENAME TO "Alert";
CREATE INDEX "Alert_status_idx" ON "Alert"("status");
CREATE INDEX "Alert_severity_idx" ON "Alert"("severity");
CREATE INDEX "Alert_apiName_idx" ON "Alert"("apiName");
CREATE INDEX "Alert_fingerprint_status_idx" ON "Alert"("fingerprint", "status");
CREATE INDEX "Alert_createdAt_idx" ON "Alert"("createdAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

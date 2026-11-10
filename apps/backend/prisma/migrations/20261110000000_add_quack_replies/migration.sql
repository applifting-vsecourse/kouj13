-- Replies and tombstones (ADR 0001). Both columns are nullable, so every
-- existing quack stays a top-level, not-deleted quack; no backfill needed.

-- AlterTable
ALTER TABLE "quack" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "parentId" TEXT;

-- CreateIndex
CREATE INDEX "quack_parentId_createdAt_idx" ON "quack"("parentId", "createdAt");

-- AddForeignKey
ALTER TABLE "quack" ADD CONSTRAINT "quack_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "quack"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

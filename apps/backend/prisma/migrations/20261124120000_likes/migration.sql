CREATE TABLE "like" (
    "quackId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "like_pkey" PRIMARY KEY ("quackId", "userId")
);
CREATE INDEX "like_userId_idx" ON "like"("userId");
ALTER TABLE "like" ADD CONSTRAINT "like_quackId_fkey" FOREIGN KEY ("quackId") REFERENCES "quack"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "like" ADD CONSTRAINT "like_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

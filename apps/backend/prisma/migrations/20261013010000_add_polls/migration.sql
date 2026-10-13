CREATE TABLE "poll" (
    "id" TEXT NOT NULL,
    "quackId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "poll_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "poll_option" (
    "id" TEXT NOT NULL,
    "pollId" TEXT NOT NULL,
    "label" VARCHAR(80) NOT NULL,
    "position" INTEGER NOT NULL,
    CONSTRAINT "poll_option_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "poll_vote" (
    "pollId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "poll_vote_pkey" PRIMARY KEY ("pollId", "userId")
);
CREATE UNIQUE INDEX "poll_quackId_key" ON "poll"("quackId");
CREATE UNIQUE INDEX "poll_option_pollId_position_key" ON "poll_option"("pollId", "position");
CREATE UNIQUE INDEX "poll_option_id_pollId_key" ON "poll_option"("id", "pollId");
CREATE INDEX "poll_vote_pollId_optionId_idx" ON "poll_vote"("pollId", "optionId");
ALTER TABLE "poll" ADD CONSTRAINT "poll_quackId_fkey" FOREIGN KEY ("quackId") REFERENCES "quack"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "poll_option" ADD CONSTRAINT "poll_option_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "poll"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "poll_vote" ADD CONSTRAINT "poll_vote_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "poll"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "poll_vote" ADD CONSTRAINT "poll_vote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "poll_vote" ADD CONSTRAINT "poll_vote_optionId_pollId_fkey" FOREIGN KEY ("optionId", "pollId") REFERENCES "poll_option"("id", "pollId") ON DELETE CASCADE ON UPDATE CASCADE;

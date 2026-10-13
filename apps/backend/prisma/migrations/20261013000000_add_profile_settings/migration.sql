ALTER TABLE "user"
ADD COLUMN "bio" VARCHAR(160) NOT NULL DEFAULT '',
ADD COLUMN "defaultMood" "quack_mood";

-- Match the case-insensitive usernames used by authentication, including
-- concurrent settings updates.
CREATE UNIQUE INDEX "user_username_lower_key" ON "user" (LOWER("username"));

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "google_sub" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "avatar_url" TEXT,
    "reset_at" BIGINT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_login_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "user_id" UUID NOT NULL,
    "auto_speak" BOOLEAN NOT NULL,
    "last_episode_id" INTEGER,
    "updated_at" BIGINT NOT NULL,
    "rev" BIGINT NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "decks" (
    "user_id" UUID NOT NULL,
    "episode_id" INTEGER NOT NULL,
    "added_at" BIGINT NOT NULL,
    "updated_at" BIGINT NOT NULL,
    "deleted_at" BIGINT,
    "rev" BIGINT NOT NULL,

    CONSTRAINT "decks_pkey" PRIMARY KEY ("user_id","episode_id")
);

-- CreateTable
CREATE TABLE "cards" (
    "user_id" UUID NOT NULL,
    "card_id" TEXT NOT NULL,
    "word" TEXT NOT NULL,
    "ipa" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "def" TEXT NOT NULL,
    "vi" TEXT NOT NULL,
    "vi_def" TEXT NOT NULL,
    "episode_ids" INTEGER[],
    "state" TEXT NOT NULL,
    "step" INTEGER NOT NULL,
    "ease" DOUBLE PRECISION NOT NULL,
    "interval" DOUBLE PRECISION NOT NULL,
    "due" BIGINT NOT NULL,
    "reps" INTEGER NOT NULL,
    "lapses" INTEGER NOT NULL,
    "added_at" BIGINT NOT NULL,
    "last_review" BIGINT,
    "updated_at" BIGINT NOT NULL,
    "deleted_at" BIGINT,
    "rev" BIGINT NOT NULL,

    CONSTRAINT "cards_pkey" PRIMARY KEY ("user_id","card_id")
);

-- CreateTable
CREATE TABLE "review_logs" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "card_id" TEXT NOT NULL,
    "rating" TEXT NOT NULL,
    "state_before" TEXT NOT NULL,
    "interval_before" DOUBLE PRECISION NOT NULL,
    "interval_after" DOUBLE PRECISION NOT NULL,
    "reviewed_at" BIGINT NOT NULL,
    "day" TEXT NOT NULL,

    CONSTRAINT "review_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "legacy_days" (
    "user_id" UUID NOT NULL,
    "import_id" UUID NOT NULL,
    "day" TEXT NOT NULL,
    "reviews" INTEGER NOT NULL,
    "learned" INTEGER NOT NULL,
    "imported_at" BIGINT NOT NULL,

    CONSTRAINT "legacy_days_pkey" PRIMARY KEY ("user_id","import_id","day")
);

-- CreateTable
CREATE TABLE "listening" (
    "user_id" UUID NOT NULL,
    "episode_id" INTEGER NOT NULL,
    "position_sec" DOUBLE PRECISION NOT NULL,
    "duration_sec" DOUBLE PRECISION NOT NULL,
    "play_count" INTEGER NOT NULL,
    "completed_at" BIGINT,
    "first_played_at" BIGINT NOT NULL,
    "last_played_at" BIGINT NOT NULL,
    "updated_at" BIGINT NOT NULL,
    "rev" BIGINT NOT NULL,

    CONSTRAINT "listening_pkey" PRIMARY KEY ("user_id","episode_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_google_sub_key" ON "users"("google_sub");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "decks_user_id_rev_idx" ON "decks"("user_id", "rev");

-- CreateIndex
CREATE INDEX "cards_user_id_rev_idx" ON "cards"("user_id", "rev");

-- CreateIndex
CREATE INDEX "review_logs_user_id_day_idx" ON "review_logs"("user_id", "day");

-- CreateIndex
CREATE INDEX "listening_user_id_rev_idx" ON "listening"("user_id", "rev");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settings" ADD CONSTRAINT "settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "decks" ADD CONSTRAINT "decks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cards" ADD CONSTRAINT "cards_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_logs" ADD CONSTRAINT "review_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "legacy_days" ADD CONSTRAINT "legacy_days_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listening" ADD CONSTRAINT "listening_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Every write to a synced table takes the next value; see prisma/schema.prisma.
CREATE SEQUENCE "sync_rev";

-- Each episode's lesson loop: when each of its four steps was first done.
CREATE TABLE "lessons" (
    "user_id" UUID NOT NULL,
    "episode_id" INTEGER NOT NULL,
    "previewed_at" BIGINT,
    "listened_at" BIGINT,
    "reviewed_at" BIGINT,
    "relistened_at" BIGINT,
    "rev" BIGINT NOT NULL,

    CONSTRAINT "lessons_pkey" PRIMARY KEY ("user_id","episode_id")
);

CREATE INDEX "lessons_user_id_rev_idx" ON "lessons"("user_id", "rev");

ALTER TABLE "lessons" ADD CONSTRAINT "lessons_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

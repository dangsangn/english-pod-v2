-- Listening history is no longer kept: only vocabulary study and the last
-- episode (settings.last_episode_id) are synced.

-- DropForeignKey
ALTER TABLE "listening" DROP CONSTRAINT "listening_user_id_fkey";

-- DropTable
DROP TABLE "listening";

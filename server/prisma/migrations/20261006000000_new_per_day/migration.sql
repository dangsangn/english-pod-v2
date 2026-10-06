-- New words a day when studying the whole garden (null = no limit).
ALTER TABLE "settings" ADD COLUMN "new_per_day" INTEGER DEFAULT 15;

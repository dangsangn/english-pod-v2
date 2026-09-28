// One /sync round trip: apply a device's changes, then return what it has not
// seen. Merging is last-write-wins on `updated_at`, done in SQL so a first
// sync of thousands of cards is one statement per table, not one per row.

import { prisma } from '../db.js'
import type { Prisma } from '../generated/prisma/client.js'
import type { SyncChanges, SyncRequest } from './schema.js'
import { latestBy, toWireCard, toWireDeck, toWireSettings, type SyncResponse } from './wire.js'

type Tx = Prisma.TransactionClient

export async function runSync(userId: string, { cursor, changes }: SyncRequest): Promise<SyncResponse> {
  return prisma.$transaction(
    async (tx) => {
      // One sync per user at a time. rev values come from a sequence, so two
      // overlapping transactions could commit out of order, and a pull made in
      // between would skip the lower rev for good.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`

      const resetAt = await applyReset(tx, userId, changes.resetAt)
      await upsertCards(tx, userId, changes.cards, resetAt)
      await deleteCards(tx, userId, changes.deletedCards)
      await upsertDecks(tx, userId, changes.decks, resetAt)
      await deleteDecks(tx, userId, changes.deletedDecks)
      if (changes.settings) await upsertSettings(tx, userId, changes.settings)
      await insertReviewLogs(tx, userId, changes.reviewLogs, resetAt)
      if (changes.legacyDays) await insertLegacyDays(tx, userId, changes.legacyDays)
      return pull(tx, userId, cursor, resetAt)
    },
    { maxWait: 10_000, timeout: 30_000 },
  )
}

/** Record a newer reset and tombstone everything older. Returns the reset in force (0 = none). */
async function applyReset(tx: Tx, userId: string, incoming: number | null): Promise<number> {
  if (incoming !== null) {
    const moved = await tx.$executeRaw`
      UPDATE users SET reset_at = ${incoming}
      WHERE id = ${userId}::uuid AND (reset_at IS NULL OR reset_at < ${incoming})`
    if (moved > 0) {
      await tx.$executeRaw`
        UPDATE cards SET deleted_at = ${incoming}, updated_at = ${incoming}, rev = nextval('sync_rev')
        WHERE user_id = ${userId}::uuid AND deleted_at IS NULL AND updated_at < ${incoming}`
      await tx.$executeRaw`
        UPDATE decks SET deleted_at = ${incoming}, updated_at = ${incoming}, rev = nextval('sync_rev')
        WHERE user_id = ${userId}::uuid AND deleted_at IS NULL AND updated_at < ${incoming}`
    }
  }
  const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { resetAt: true } })
  return user.resetAt === null ? 0 : Number(user.resetAt)
}

async function upsertCards(tx: Tx, userId: string, cards: SyncChanges['cards'], resetAt: number) {
  const rows = latestBy(cards, (c) => c.id, (c) => c.updatedAt).filter((c) => c.updatedAt >= resetAt)
  if (!rows.length) return
  await tx.$executeRaw`
    INSERT INTO cards AS c (user_id, card_id, word, ipa, "type", def, vi, vi_def, episode_ids,
      state, step, ease, "interval", due, reps, lapses, added_at, last_review, updated_at, deleted_at, rev)
    SELECT ${userId}::uuid, x."id", x."word", x."ipa", x."type", x."def", x."vi", x."viDef", x."episodeIds",
      x."state", x."step", x."ease", x."interval", x."due", x."reps", x."lapses", x."addedAt", x."lastReview",
      x."updatedAt", NULL, nextval('sync_rev')
    FROM jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) AS x("id" text, "word" text, "ipa" text,
      "type" text, "def" text, "vi" text, "viDef" text, "episodeIds" int[], "state" text, "step" int,
      "ease" float8, "interval" float8, "due" bigint, "reps" int, "lapses" int, "addedAt" bigint,
      "lastReview" bigint, "updatedAt" bigint)
    ON CONFLICT (user_id, card_id) DO UPDATE SET
      word = EXCLUDED.word, ipa = EXCLUDED.ipa, "type" = EXCLUDED."type", def = EXCLUDED.def,
      vi = EXCLUDED.vi, vi_def = EXCLUDED.vi_def, episode_ids = EXCLUDED.episode_ids,
      state = EXCLUDED.state, step = EXCLUDED.step, ease = EXCLUDED.ease, "interval" = EXCLUDED."interval",
      due = EXCLUDED.due, reps = EXCLUDED.reps, lapses = EXCLUDED.lapses, added_at = EXCLUDED.added_at,
      last_review = EXCLUDED.last_review, updated_at = EXCLUDED.updated_at, deleted_at = NULL,
      rev = EXCLUDED.rev
    WHERE c.updated_at < EXCLUDED.updated_at`
}

/**
 * A tombstone is kept even for a card the server never had: a device that
 * still holds the card must not bring it back with an older edit.
 */
async function deleteCards(tx: Tx, userId: string, deleted: SyncChanges['deletedCards']) {
  const rows = latestBy(deleted, (c) => c.id, (c) => c.deletedAt)
  if (!rows.length) return
  await tx.$executeRaw`
    INSERT INTO cards AS c (user_id, card_id, word, ipa, "type", def, vi, vi_def, episode_ids,
      state, step, ease, "interval", due, reps, lapses, added_at, last_review, updated_at, deleted_at, rev)
    SELECT ${userId}::uuid, x."id", x."id", '', '', '', '', '', '{}',
      'new', 0, 2.5, 0, 0, 0, 0, 0, NULL, x."deletedAt", x."deletedAt", nextval('sync_rev')
    FROM jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) AS x("id" text, "deletedAt" bigint)
    ON CONFLICT (user_id, card_id) DO UPDATE SET
      updated_at = EXCLUDED.updated_at, deleted_at = EXCLUDED.deleted_at, rev = EXCLUDED.rev
    WHERE c.updated_at < EXCLUDED.updated_at`
}

async function upsertDecks(tx: Tx, userId: string, decks: SyncChanges['decks'], resetAt: number) {
  const rows = latestBy(decks, (d) => d.episodeId, (d) => d.updatedAt).filter((d) => d.updatedAt >= resetAt)
  if (!rows.length) return
  await tx.$executeRaw`
    INSERT INTO decks AS d (user_id, episode_id, added_at, updated_at, deleted_at, rev)
    SELECT ${userId}::uuid, x."episodeId", x."addedAt", x."updatedAt", NULL, nextval('sync_rev')
    FROM jsonb_to_recordset(${JSON.stringify(rows)}::jsonb)
      AS x("episodeId" int, "addedAt" bigint, "updatedAt" bigint)
    ON CONFLICT (user_id, episode_id) DO UPDATE SET
      added_at = EXCLUDED.added_at, updated_at = EXCLUDED.updated_at, deleted_at = NULL, rev = EXCLUDED.rev
    WHERE d.updated_at < EXCLUDED.updated_at`
}

async function deleteDecks(tx: Tx, userId: string, deleted: SyncChanges['deletedDecks']) {
  const rows = latestBy(deleted, (d) => d.episodeId, (d) => d.deletedAt)
  if (!rows.length) return
  await tx.$executeRaw`
    INSERT INTO decks AS d (user_id, episode_id, added_at, updated_at, deleted_at, rev)
    SELECT ${userId}::uuid, x."episodeId", 0, x."deletedAt", x."deletedAt", nextval('sync_rev')
    FROM jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) AS x("episodeId" int, "deletedAt" bigint)
    ON CONFLICT (user_id, episode_id) DO UPDATE SET
      updated_at = EXCLUDED.updated_at, deleted_at = EXCLUDED.deleted_at, rev = EXCLUDED.rev
    WHERE d.updated_at < EXCLUDED.updated_at`
}

async function upsertSettings(tx: Tx, userId: string, settings: NonNullable<SyncChanges['settings']>) {
  await tx.$executeRaw`
    INSERT INTO settings AS s (user_id, auto_speak, last_episode_id, updated_at, rev)
    VALUES (${userId}::uuid, ${settings.autoSpeak}, ${settings.lastEpisodeId}, ${settings.updatedAt},
      nextval('sync_rev'))
    ON CONFLICT (user_id) DO UPDATE SET
      auto_speak = EXCLUDED.auto_speak, last_episode_id = EXCLUDED.last_episode_id,
      updated_at = EXCLUDED.updated_at, rev = EXCLUDED.rev
    WHERE s.updated_at < EXCLUDED.updated_at`
}

/** Logs are append-only and keyed by a device-made UUID, so a retried push adds nothing. */
async function insertReviewLogs(tx: Tx, userId: string, logs: SyncChanges['reviewLogs'], resetAt: number) {
  const rows = logs.filter((l) => l.reviewedAt >= resetAt)
  if (!rows.length) return
  await tx.$executeRaw`
    INSERT INTO review_logs (id, user_id, card_id, rating, state_before, interval_before,
      interval_after, reviewed_at, day)
    SELECT x."id", ${userId}::uuid, x."cardId", x."rating", x."stateBefore", x."intervalBefore",
      x."intervalAfter", x."reviewedAt", x."day"
    FROM jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) AS x("id" uuid, "cardId" text,
      "rating" text, "stateBefore" text, "intervalBefore" float8, "intervalAfter" float8,
      "reviewedAt" bigint, "day" text)
    ON CONFLICT (id) DO NOTHING`
}

/** Daily counts from before review logs existed. One import per device, so a retry adds nothing. */
async function insertLegacyDays(tx: Tx, userId: string, legacy: NonNullable<SyncChanges['legacyDays']>) {
  const rows = Object.entries(legacy.days).map(([day, counts]) => ({ day, ...counts }))
  if (!rows.length) return
  await tx.$executeRaw`
    INSERT INTO legacy_days (user_id, import_id, day, reviews, learned, imported_at)
    SELECT ${userId}::uuid, ${legacy.importId}::uuid, x."day", x."reviews", x."learned", ${Date.now()}
    FROM jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) AS x("day" text, "reviews" int, "learned" int)
    ON CONFLICT (user_id, import_id, day) DO NOTHING`
}

async function pull(tx: Tx, userId: string, cursor: number | null, resetAt: number): Promise<SyncResponse> {
  const since = BigInt(cursor ?? 0)
  const changed = { userId, rev: { gt: since } }
  // A device syncing for the first time has nothing to delete.
  const live = cursor === null ? { deletedAt: null } : {}

  const cards = await tx.card.findMany({ where: { ...changed, ...live } })
  const decks = await tx.deck.findMany({ where: { ...changed, ...live } })
  const settings = await tx.settings.findFirst({ where: changed })

  const revs = [...cards, ...decks, ...(settings ? [settings] : [])].map((row) => row.rev)
  const next = revs.reduce((max, rev) => (rev > max ? rev : max), since)

  const days = await tx.$queryRaw<{ day: string; reviews: number; learned: number }[]>`
    SELECT day, SUM(reviews)::int AS reviews, SUM(learned)::int AS learned FROM (
      SELECT day, COUNT(*) AS reviews, COUNT(*) FILTER (WHERE state_before = 'new') AS learned
      FROM review_logs WHERE user_id = ${userId}::uuid AND reviewed_at >= ${resetAt} GROUP BY day
      UNION ALL
      SELECT day, SUM(reviews), SUM(learned)
      FROM legacy_days WHERE user_id = ${userId}::uuid AND imported_at >= ${resetAt} GROUP BY day
    ) t GROUP BY day`

  return {
    cursor: Number(next),
    changes: {
      cards: cards.filter((c) => c.deletedAt === null).map(toWireCard),
      deletedCards: cards
        .filter((c) => c.deletedAt !== null)
        .map((c) => ({ id: c.cardId, deletedAt: Number(c.deletedAt) })),
      decks: decks.filter((d) => d.deletedAt === null).map(toWireDeck),
      deletedDecks: decks
        .filter((d) => d.deletedAt !== null)
        .map((d) => ({ episodeId: d.episodeId, deletedAt: Number(d.deletedAt) })),
      settings: settings ? toWireSettings(settings) : null,
    },
    days: Object.fromEntries(days.map((d) => [d.day, { reviews: d.reviews, learned: d.learned }])),
    resetAt: resetAt || null,
  }
}

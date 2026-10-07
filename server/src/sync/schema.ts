import { z } from 'zod'

// Timestamps are epoch milliseconds, as Date.now() and src/lib/srs.js use.
const ms = z.number().int().nonnegative()
const count = z.number().int().nonnegative()
// Cards saved before the vocab files carried every field lack some of them.
const text = z.string().max(5000).default('')
const cardState = z.enum(['new', 'learning', 'review', 'relearning'])
const dayKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const cardId = z.string().min(1).max(500)

export const cardSchema = z.object({
  id: cardId,
  word: text,
  ipa: text,
  type: text,
  def: text,
  vi: text,
  viDef: text,
  episodeIds: z.array(z.number().int()).max(1000),
  state: cardState,
  step: count,
  ease: z.number(),
  interval: z.number().nonnegative(),
  due: ms,
  reps: count,
  lapses: count,
  addedAt: ms,
  lastReview: ms.nullable().default(null),
  updatedAt: ms,
})

export const deckSchema = z.object({ episodeId: z.number().int(), addedAt: ms, updatedAt: ms })

// A step missing from a lesson is not done (yet) on that device.
export const lessonSchema = z.object({
  episodeId: z.number().int(),
  preview: ms.optional(),
  listen: ms.optional(),
  review: ms.optional(),
  relisten: ms.optional(),
})

export const settingsSchema = z.object({
  autoSpeak: z.boolean(),
  lastEpisodeId: z.number().int().nullable(),
  // Absent from a client older than the cap: the server keeps the stored value.
  newPerDay: z.number().int().min(1).max(999).nullable().optional(),
  updatedAt: ms,
})

const reviewLogSchema = z.object({
  id: z.uuid(),
  cardId,
  rating: z.enum(['again', 'hard', 'good', 'easy']),
  stateBefore: cardState,
  intervalBefore: z.number().nonnegative(),
  intervalAfter: z.number().nonnegative(),
  reviewedAt: ms,
  day: dayKey,
})

export const dayCountsSchema = z.object({ reviews: count, learned: count })

export const syncRequestSchema = z.object({
  cursor: z.number().int().nonnegative().nullable(),
  changes: z.object({
    cards: z.array(cardSchema).max(20_000).default([]),
    deletedCards: z.array(z.object({ id: cardId, deletedAt: ms })).max(20_000).default([]),
    decks: z.array(deckSchema).max(1000).default([]),
    deletedDecks: z.array(z.object({ episodeId: z.number().int(), deletedAt: ms })).max(1000).default([]),
    // Absent from a client older than the lesson loop.
    lessons: z.array(lessonSchema).max(1000).default([]),
    settings: settingsSchema.nullable().default(null),
    reviewLogs: z.array(reviewLogSchema).max(50_000).default([]),
    legacyDays: z
      .object({ importId: z.uuid(), days: z.record(dayKey, dayCountsSchema) })
      .nullable()
      .default(null),
    resetAt: ms.nullable().default(null),
  }),
})

export type SyncRequest = z.infer<typeof syncRequestSchema>
export type SyncChanges = SyncRequest['changes']

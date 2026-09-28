import type { z } from 'zod'
import type { Card, Deck, Listening, Settings } from '../generated/prisma/client.js'
import type { cardSchema, dayCountsSchema, deckSchema, listeningSchema, settingsSchema } from './schema.js'

// The JSON shapes /sync sends back — the same shapes devices push.
export type WireCard = z.infer<typeof cardSchema>
export type WireDeck = z.infer<typeof deckSchema>
export type WireListening = z.infer<typeof listeningSchema>
export type WireSettings = z.infer<typeof settingsSchema>
export type DayCounts = z.infer<typeof dayCountsSchema>

export interface SyncResponse {
  cursor: number
  changes: {
    cards: WireCard[]
    deletedCards: { id: string; deletedAt: number }[]
    decks: WireDeck[]
    deletedDecks: { episodeId: number; deletedAt: number }[]
    listening: WireListening[]
    settings: WireSettings | null
  }
  days: Record<string, DayCounts>
  resetAt: number | null
}

/**
 * One item per key, the latest by `time`. Postgres refuses to upsert the same
 * row twice in one INSERT … ON CONFLICT DO UPDATE.
 */
export function latestBy<T>(items: T[], key: (item: T) => string | number, time: (item: T) => number): T[] {
  const byKey = new Map<string | number, T>()
  for (const item of items) {
    const seen = byKey.get(key(item))
    if (!seen || time(item) > time(seen)) byKey.set(key(item), item)
  }
  return [...byKey.values()]
}

const num = (value: bigint) => Number(value)
const numOrNull = (value: bigint | null) => (value === null ? null : Number(value))

export function toWireCard(c: Card): WireCard {
  return {
    id: c.cardId,
    word: c.word,
    ipa: c.ipa,
    type: c.type,
    def: c.def,
    vi: c.vi,
    viDef: c.viDef,
    episodeIds: c.episodeIds,
    state: c.state as WireCard['state'],
    step: c.step,
    ease: c.ease,
    interval: c.interval,
    due: num(c.due),
    reps: c.reps,
    lapses: c.lapses,
    addedAt: num(c.addedAt),
    lastReview: numOrNull(c.lastReview),
    updatedAt: num(c.updatedAt),
  }
}

export function toWireDeck(d: Deck): WireDeck {
  return { episodeId: d.episodeId, addedAt: num(d.addedAt), updatedAt: num(d.updatedAt) }
}

export function toWireListening(l: Listening): WireListening {
  return {
    episodeId: l.episodeId,
    positionSec: l.positionSec,
    durationSec: l.durationSec,
    playCount: l.playCount,
    completedAt: numOrNull(l.completedAt),
    firstPlayedAt: num(l.firstPlayedAt),
    lastPlayedAt: num(l.lastPlayedAt),
    updatedAt: num(l.updatedAt),
  }
}

export function toWireSettings(s: Settings): WireSettings {
  return { autoSpeak: s.autoSpeak, lastEpisodeId: s.lastEpisodeId, updatedAt: num(s.updatedAt) }
}

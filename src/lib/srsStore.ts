// Persistent state for vocabulary study, kept in localStorage.
//
// Components read it through useSrs() (useSyncExternalStore), and change it only
// through the exported actions, so every write is saved and every subscriber
// re-renders from the same snapshot.
//
// Every action stamps what it changes with `updatedAt` and every deletion
// leaves a tombstone, so sync.ts can push this device's edits and merge in
// other devices' (last write wins).

import { useSyncExternalStore } from 'react'
import type { Episode, VocabEntry } from '../types'
import {
  addDays,
  cardContent,
  cardId,
  createCard,
  dayKey,
  isDue,
  schedule,
  stageOf,
} from './srs.ts'
import type { Card, CardContent, CardState, Rating, Stage } from './srs'
import { uuid } from './uuid.ts'

export interface StoredCard extends Card {
  updatedAt: number
}

export interface DeckMeta {
  addedAt: number
  updatedAt: number
}

export interface Settings {
  autoSpeak: boolean
  lastEpisodeId: number | null
  /** New cards a day when studying the whole garden; null = no limit. */
  newPerDay: number | null
}

export interface DayCounts {
  reviews: number
  learned: number
}

export interface ReviewLog {
  id: string
  cardId: string
  rating: Rating
  stateBefore: CardState
  intervalBefore: number
  intervalAfter: number
  reviewedAt: number
  day: string
}

export interface SrsState {
  cards: Record<string, StoredCard>
  decks: number[]
  deckMeta: Record<number, DeckMeta>
  settings: Settings
  settingsUpdatedAt: number
  days: Record<string, DayCounts>
  tombstones: { cards: Record<string, number>; decks: Record<number, number> }
  pendingLogs: ReviewLog[]
  resetAt: number | null
}

/** Per stage, plus what is due, what can be studied ahead, and how many new cards today allows. */
export type Summary = Record<Stage | 'total' | 'due' | 'ahead' | 'freshToday', number>

// The /sync wire format, as server/src/sync/wire.ts and schema.ts define it.
export interface SrsChanges {
  cards: StoredCard[]
  deletedCards: { id: string; deletedAt: number }[]
  decks: ({ episodeId: number } & DeckMeta)[]
  deletedDecks: { episodeId: number; deletedAt: number }[]
  settings: (Settings & { updatedAt: number }) | null
  reviewLogs: ReviewLog[]
  resetAt: number | null
}

export interface SyncResponse {
  cursor: number
  changes: Omit<SrsChanges, 'reviewLogs' | 'resetAt'>
  days: Record<string, DayCounts>
  resetAt: number | null
}

const STORAGE_KEY = 'englishpod_srs_v1'
// Before settings.lastEpisodeId, App.tsx kept the last episode under this key.
const LEGACY_LAST_EPISODE_KEY = 'englishpod_last_episode_id'

const DEFAULT_STATE: SrsState = {
  cards: {}, // id → card (see srs.createCard) + updatedAt
  decks: [], // episode ids, in the order they were added
  deckMeta: {}, // episode id → { addedAt, updatedAt }
  settings: { autoSpeak: true, lastEpisodeId: null, newPerDay: 15 },
  settingsUpdatedAt: 0,
  days: {}, // YYYY-MM-DD → { reviews, learned }
  tombstones: { cards: {}, decks: {} }, // id → deletedAt, until pushed
  pendingLogs: [], // review logs not pushed yet
  resetAt: null,
}

function load(): SrsState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const saved = raw ? JSON.parse(raw) : {}
    return migrate({
      ...DEFAULT_STATE,
      ...saved,
      settings: { ...DEFAULT_STATE.settings, ...saved.settings },
      tombstones: { ...DEFAULT_STATE.tombstones, ...saved.tombstones },
    })
  } catch (error) {
    console.error('Error reading vocabulary progress:', error)
    return DEFAULT_STATE
  }
}

/** Fill in the sync fields for progress saved before they existed. */
function migrate(s: SrsState, now = Date.now()): SrsState {
  const cards: Record<string, StoredCard> = {}
  for (const [id, card] of Object.entries(s.cards)) {
    cards[id] = card.updatedAt ? card : { ...card, updatedAt: card.lastReview ?? card.addedAt }
  }
  const deckMeta = { ...s.deckMeta }
  for (const episodeId of s.decks) {
    deckMeta[episodeId] ??= { addedAt: now, updatedAt: now }
  }
  let settings = s.settings
  if (settings.lastEpisodeId === null) {
    const legacy = parseInt(localStorage.getItem(LEGACY_LAST_EPISODE_KEY) ?? '', 10)
    if (Number.isInteger(legacy)) settings = { ...settings, lastEpisodeId: legacy }
  }
  // Settings someone chose before sync existed are a real edit: stamp them, or
  // they would lose to the untouched defaults of every other device.
  let { settingsUpdatedAt } = s
  if (!settingsUpdatedAt && JSON.stringify(settings) !== JSON.stringify(DEFAULT_STATE.settings)) {
    settingsUpdatedAt = now
  }
  return { ...s, cards, deckMeta, settings, settingsUpdatedAt }
}

let state = load()
const listeners = new Set<() => void>()
const localChangeListeners = new Set<() => void>()
let logReviews = false

/** `remote` marks merged sync results, which must not schedule another sync. */
function setState(updater: (s: SrsState) => SrsState, { remote = false } = {}) {
  const next = updater(state)
  if (next === state) return
  state = next
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch (error) {
    console.error('Error saving vocabulary progress:', error)
  }
  listeners.forEach((listener) => listener())
  if (!remote) localChangeListeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useSrs() {
  return useSyncExternalStore(subscribe, () => state)
}

export function getSrsState() {
  return state
}

/** Called after every change made on this device (not after merging a sync). */
export function subscribeLocalChanges(listener: () => void) {
  localChangeListeners.add(listener)
  return () => {
    localChangeListeners.delete(listener)
  }
}

/**
 * Keep a log entry per answer. sync.ts turns this on while the progress belongs
 * to an account; signed-out use keeps only the daily counts, so localStorage
 * does not fill up with logs nothing will ever read.
 */
export function setReviewLogging(enabled: boolean) {
  logReviews = enabled
}

/**
 * Add an episode's words as new cards. A word already in the collection (from
 * another episode) is not duplicated — the episode is just linked to it.
 */
export function addDeck(episodeId: number, entries: VocabEntry[], now = Date.now()) {
  setState((s) => {
    const cards = { ...s.cards }
    const cardTombstones = { ...s.tombstones.cards }
    entries.forEach((entry, index) => {
      if (!entry?.word) return
      const id = cardId(entry.word)
      const existing = cards[id]
      if (existing) {
        if (!existing.episodeIds.includes(episodeId)) {
          cards[id] = {
            ...existing,
            episodeIds: [...existing.episodeIds, episodeId],
            updatedAt: now,
          }
        }
        return
      }
      // Offset addedAt by position so new cards come up in the episode's order.
      cards[id] = { ...createCard(entry, episodeId, now + index), updatedAt: now }
      delete cardTombstones[id]
    })
    const decks = s.decks.includes(episodeId) ? s.decks : [...s.decks, episodeId]
    const deckMeta = {
      ...s.deckMeta,
      [episodeId]: { addedAt: s.deckMeta[episodeId]?.addedAt ?? now, updatedAt: now },
    }
    const deckTombstones = { ...s.tombstones.decks }
    delete deckTombstones[episodeId]
    return {
      ...s,
      cards,
      decks,
      deckMeta,
      tombstones: { cards: cardTombstones, decks: deckTombstones },
    }
  })
}

/** Drop an episode. Cards it shares with another deck stay; the rest go. */
export function removeDeck(episodeId: number, now = Date.now()) {
  setState((s) => {
    const cards: Record<string, StoredCard> = {}
    const cardTombstones = { ...s.tombstones.cards }
    for (const [id, card] of Object.entries(s.cards)) {
      if (!card.episodeIds.includes(episodeId)) {
        cards[id] = card
        continue
      }
      const episodeIds = card.episodeIds.filter((e) => e !== episodeId)
      if (episodeIds.length) cards[id] = { ...card, episodeIds, updatedAt: now }
      else cardTombstones[id] = now
    }
    const deckMeta = { ...s.deckMeta }
    delete deckMeta[episodeId]
    return {
      ...s,
      cards,
      decks: s.decks.filter((e) => e !== episodeId),
      deckMeta,
      tombstones: { cards: cardTombstones, decks: { ...s.tombstones.decks, [episodeId]: now } },
    }
  })
}

export function rateCard(id: string, rating: Rating, now = Date.now()) {
  setState((s) => {
    const card = s.cards[id]
    if (!card) return s
    const next = { ...schedule(card, rating, now), updatedAt: now }
    const key = dayKey(now)
    const today = s.days[key] || { reviews: 0, learned: 0 }
    const log: ReviewLog = {
      id: uuid(),
      cardId: id,
      rating,
      stateBefore: card.state,
      intervalBefore: card.interval,
      intervalAfter: next.interval,
      reviewedAt: now,
      day: key,
    }
    return {
      ...s,
      cards: { ...s.cards, [id]: next },
      days: {
        ...s.days,
        [key]: {
          reviews: today.reviews + 1,
          learned: today.learned + (card.state === 'new' ? 1 : 0),
        },
      },
      pendingLogs: logReviews ? [...s.pendingLogs, log] : s.pendingLogs,
    }
  })
}

/**
 * "I've forgotten this one" from the word list: treat it like an "Again"
 * answer, but due right away so the next session picks it up. It is not a
 * review, so the daily counts and the review count stay as they were.
 */
export function relearnCard(id: string, now = Date.now()) {
  setState((s) => {
    const card = s.cards[id]
    if (!card || card.state === 'new') return s
    const next = schedule(card, 'again', now)
    return {
      ...s,
      cards: {
        ...s.cards,
        [id]: { ...next, reps: card.reps, lastReview: card.lastReview, due: now, updatedAt: now },
      },
    }
  })
}

export function updateSettings(patch: Partial<Settings>, now = Date.now()) {
  setState((s) => {
    const keys = Object.keys(patch) as (keyof Settings)[]
    if (keys.every((key) => s.settings[key] === patch[key])) return s
    return { ...s, settings: { ...s.settings, ...patch }, settingsUpdatedAt: now }
  })
}

/** Wipe the study progress on every device of the account (settings stay). */
export function resetProgress(now = Date.now()) {
  setState((s) => ({
    ...DEFAULT_STATE,
    settings: s.settings,
    settingsUpdatedAt: s.settingsUpdatedAt,
    resetAt: now,
  }))
}

/** Forget this device's copy (sign-out, or another account signing in). Not a reset. */
export function clearLocalProgress() {
  setState(() => DEFAULT_STATE, { remote: true })
}

// ---------------------------------------------------------------------------
// Selectors — pure reads over a state snapshot.

/** Consecutive days with at least one review, ending today (or yesterday). */
export function streakOf(s: SrsState, now: number): number {
  let cursor = s.days[dayKey(now)]?.reviews ? now : addDays(now, -1)
  let streak = 0
  while (s.days[dayKey(cursor)]?.reviews) {
    streak++
    cursor = addDays(cursor, -1)
  }
  return streak
}

/** New cards today still allows when studying the whole garden. */
export function newCardsLeft(s: SrsState, now: number): number {
  const limit = s.settings.newPerDay
  if (limit === null) return Infinity
  return Math.max(0, limit - (s.days[dayKey(now)]?.learned ?? 0))
}

/**
 * Counts per garden stage, optionally for one episode, plus what is due and
 * what could be studied ahead of schedule (studied, but not due yet).
 */
export function summarize(s: SrsState, now: number, episodeId: number | null = null): Summary {
  const counts: Summary = {
    seed: 0,
    sprout: 0,
    bud: 0,
    bloom: 0,
    total: 0,
    due: 0,
    ahead: 0,
    freshToday: 0,
  }
  for (const card of Object.values(s.cards)) {
    if (episodeId !== null && !card.episodeIds.includes(episodeId)) continue
    counts[stageOf(card)]++
    counts.total++
    if (isDue(card, now)) counts.due++
    else if (card.state !== 'new') counts.ahead++
  }
  // One episode's study is a deliberate choice and is not capped (see buildQueue).
  counts.freshToday = episodeId === null ? Math.min(counts.seed, newCardsLeft(s, now)) : counts.seed
  return counts
}

/**
 * Card ids for a study session: everything due, oldest first, with every new
 * card woven in — one after every few reviews, so a session is never a wall of
 * unfamiliar words at the end. Across the whole garden, new cards stop at the daily cap (settings.newPerDay); one episode's session takes all of its new cards.
 *
 * When nothing is due and nothing is new, the session reviews ahead instead:
 * the studied cards, soonest-due first. So there is always something to study.
 */
export function buildQueue(s: SrsState, now: number, episodeId: number | null = null): string[] {
  const inScope = Object.values(s.cards).filter(
    (c) => episodeId === null || c.episodeIds.includes(episodeId),
  )
  const due = inScope.filter((c) => isDue(c, now)).sort((a, b) => a.due - b.due)
  const fresh = inScope
    .filter((c) => c.state === 'new')
    .sort((a, b) => a.addedAt - b.addedAt)
    .slice(0, episodeId === null ? newCardsLeft(s, now) : Infinity)

  const queue: string[] = []
  let d = 0
  let n = 0
  while (d < due.length || n < fresh.length) {
    for (let k = 0; k < 3 && d < due.length; k++) queue.push(due[d++].id)
    if (n < fresh.length) queue.push(fresh[n++].id)
  }
  if (queue.length) return queue

  return inScope
    .filter((c) => c.state !== 'new')
    .sort((a, b) => a.due - b.due)
    .map((c) => c.id)
}

/**
 * Fetch an episode's vocabulary file and add it as a deck.
 * Resolves to the number of words in the file; throws if there is none.
 */
export async function addEpisodeDeck(episode: Episode): Promise<number> {
  const res = await fetch(`./vocab/${episode.transcript_id}.json`)
  if (!res.ok) throw new Error('Vocabulary missing')
  const entries: unknown = await res.json()
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error('Vocabulary empty')
  }
  addDeck(episode.id, entries)
  return entries.length
}

/**
 * Cards saved before the vocab files carried the English definition have no
 * `def` field. Re-read those episodes' files once and fill the content in,
 * leaving the study progress untouched.
 */
let backfillStarted = false
export async function backfillCardContent(episodes: Episode[]) {
  if (backfillStarted) return
  backfillStarted = true

  const stale = Object.values(state.cards).filter((c) => !Object.hasOwn(c, 'def'))
  const episodeIds = [...new Set(stale.map((c) => c.episodeIds[0]))]
  if (episodeIds.length === 0) return

  const content = new Map<string, CardContent>()
  await Promise.all(
    episodeIds.map(async (id) => {
      const episode = episodes.find((e) => e.id === id)
      if (!episode) return
      try {
        const res = await fetch(`./vocab/${episode.transcript_id}.json`)
        if (!res.ok) return
        const entries: VocabEntry[] = await res.json()
        for (const entry of entries) {
          const key = cardId(entry.word)
          if (!content.has(key)) content.set(key, cardContent(entry))
        }
      } catch {
        // Offline or missing: the card just keeps showing what it has.
      }
    }),
  )
  if (content.size === 0) return

  setState((s) => {
    const cards = { ...s.cards }
    for (const [id, card] of Object.entries(cards)) {
      if (!Object.hasOwn(card, 'def') && content.has(id)) {
        cards[id] = { ...card, ...content.get(id), updatedAt: Date.now() }
      }
    }
    return { ...s, cards }
  })
}

// ---------------------------------------------------------------------------
// Sync — the protocol is described in sync.ts.

/**
 * This device's changes in the shape POST /sync expects: everything stamped at
 * or after `since` (ms), or everything when `since` is null (first sync).
 * Tombstones and pending logs always go, until a sync confirms them.
 */
export function collectSrsChanges(since: number | null): SrsChanges {
  const s = state
  const changed = (time: number) => since === null || time >= since
  return {
    cards: Object.values(s.cards).filter((card) => changed(card.updatedAt)),
    deletedCards: Object.entries(s.tombstones.cards).map(([id, deletedAt]) => ({ id, deletedAt })),
    decks: s.decks
      .filter((episodeId) => changed(s.deckMeta[episodeId]?.updatedAt ?? 0))
      .map((episodeId) => ({ episodeId, ...s.deckMeta[episodeId] })),
    deletedDecks: Object.entries(s.tombstones.decks).map(([episodeId, deletedAt]) => ({
      episodeId: Number(episodeId),
      deletedAt,
    })),
    settings: changed(s.settingsUpdatedAt)
      ? { ...s.settings, updatedAt: s.settingsUpdatedAt }
      : null,
    reviewLogs: s.pendingLogs,
    resetAt: s.resetAt,
  }
}

/**
 * Merge a /sync response. `sent` is what collectSrsChanges returned for that
 * request: what it carried is cleared, while edits made during the request stay
 * for the next push. A remote record wins unless the local one is newer.
 */
export function applySyncResult(sent: SrsChanges, response: SyncResponse) {
  const { changes } = response
  setState(
    (s) => {
      const cards = { ...s.cards }
      const cardTombstones = { ...s.tombstones.cards }
      const cardTime = (id: string) => cards[id]?.updatedAt ?? cardTombstones[id] ?? -1
      for (const card of changes.cards) {
        if (card.updatedAt < cardTime(card.id)) continue
        cards[card.id] = card
        delete cardTombstones[card.id]
      }
      for (const { id, deletedAt } of changes.deletedCards) {
        if (deletedAt < cardTime(id)) continue
        delete cards[id]
        delete cardTombstones[id]
      }

      let decks = [...s.decks]
      const deckMeta = { ...s.deckMeta }
      const deckTombstones = { ...s.tombstones.decks }
      const deckTime = (episodeId: number) =>
        deckMeta[episodeId]?.updatedAt ?? deckTombstones[episodeId] ?? -1
      for (const { episodeId, addedAt, updatedAt } of changes.decks) {
        if (updatedAt < deckTime(episodeId)) continue
        deckMeta[episodeId] = { addedAt, updatedAt }
        delete deckTombstones[episodeId]
        if (!decks.includes(episodeId)) decks.push(episodeId)
      }
      for (const { episodeId, deletedAt } of changes.deletedDecks) {
        if (deletedAt < deckTime(episodeId)) continue
        delete deckMeta[episodeId]
        delete deckTombstones[episodeId]
        decks = decks.filter((e) => e !== episodeId)
      }

      let { settings, settingsUpdatedAt, resetAt } = s
      if (changes.settings && changes.settings.updatedAt > settingsUpdatedAt) {
        const { autoSpeak, lastEpisodeId } = changes.settings
        // A server from before the cap sends no newPerDay: keep the default.
        const newPerDay =
          'newPerDay' in changes.settings
            ? changes.settings.newPerDay
            : DEFAULT_STATE.settings.newPerDay
        settings = { ...settings, autoSpeak, lastEpisodeId, newPerDay }
        settingsUpdatedAt = changes.settings.updatedAt
      }

      // Another device reset the progress: drop whatever predates it here too.
      if (response.resetAt !== null && response.resetAt > (resetAt ?? -1)) {
        resetAt = response.resetAt
        for (const [id, card] of Object.entries(cards)) {
          if (card.updatedAt < resetAt) delete cards[id]
        }
        for (const episodeId of decks) {
          if (deckMeta[episodeId].updatedAt < resetAt) delete deckMeta[episodeId]
        }
        decks = decks.filter((episodeId) => episodeId in deckMeta)
      }

      for (const { id, deletedAt } of sent.deletedCards) {
        if (cardTombstones[id] === deletedAt) delete cardTombstones[id]
      }
      for (const { episodeId, deletedAt } of sent.deletedDecks) {
        if (deckTombstones[episodeId] === deletedAt) delete deckTombstones[episodeId]
      }
      const sentLogs = new Set(sent.reviewLogs.map((log) => log.id))
      const pendingLogs = s.pendingLogs.filter((log) => !sentLogs.has(log.id))

      // The server's counts cover every device; add what is still unpushed here.
      const days: Record<string, DayCounts> = {}
      for (const [day, counts] of Object.entries(response.days)) days[day] = { ...counts }
      for (const log of pendingLogs) {
        const today = days[log.day] || { reviews: 0, learned: 0 }
        days[log.day] = {
          reviews: today.reviews + 1,
          learned: today.learned + (log.stateBefore === 'new' ? 1 : 0),
        }
      }

      return {
        ...s,
        cards,
        decks,
        deckMeta,
        settings,
        settingsUpdatedAt,
        days,
        tombstones: { cards: cardTombstones, decks: deckTombstones },
        pendingLogs,
        resetAt,
      }
    },
    { remote: true },
  )
}

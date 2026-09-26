// Persistent state for vocabulary study, kept in localStorage.
//
// Components read it through useSrs() (useSyncExternalStore), and change it only
// through the exported actions, so every write is saved and every subscriber
// re-renders from the same snapshot.

import { useSyncExternalStore } from 'react'
import { addDays, cardContent, cardId, createCard, dayKey, isDue, schedule, stageOf } from './srs'

const STORAGE_KEY = 'englishpod_srs_v1'

const DEFAULT_STATE = {
  cards: {}, // id → card (see srs.createCard)
  decks: [], // episode ids, in the order they were added
  settings: { autoSpeak: true },
  days: {}, // YYYY-MM-DD → { reviews, learned }
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_STATE
    const saved = JSON.parse(raw)
    return {
      ...DEFAULT_STATE,
      ...saved,
      settings: { ...DEFAULT_STATE.settings, ...saved.settings },
    }
  } catch (error) {
    console.error('Error reading vocabulary progress:', error)
    return DEFAULT_STATE
  }
}

let state = load()
const listeners = new Set()

function setState(updater) {
  state = updater(state)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch (error) {
    console.error('Error saving vocabulary progress:', error)
  }
  listeners.forEach((listener) => listener())
}

function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useSrs() {
  return useSyncExternalStore(subscribe, () => state)
}

/**
 * Add an episode's words as new cards. A word already in the collection (from
 * another episode) is not duplicated — the episode is just linked to it.
 */
export function addDeck(episodeId, entries, now = Date.now()) {
  setState((s) => {
    const cards = { ...s.cards }
    entries.forEach((entry, index) => {
      if (!entry?.word) return
      const id = cardId(entry.word)
      const existing = cards[id]
      if (existing) {
        if (!existing.episodeIds.includes(episodeId)) {
          cards[id] = { ...existing, episodeIds: [...existing.episodeIds, episodeId] }
        }
        return
      }
      // Offset addedAt by position so new cards come up in the episode's order.
      cards[id] = createCard(entry, episodeId, now + index)
    })
    const decks = s.decks.includes(episodeId) ? s.decks : [...s.decks, episodeId]
    return { ...s, cards, decks }
  })
}

/** Drop an episode. Cards it shares with another deck stay; the rest go. */
export function removeDeck(episodeId) {
  setState((s) => {
    const cards = {}
    for (const [id, card] of Object.entries(s.cards)) {
      const episodeIds = card.episodeIds.filter((e) => e !== episodeId)
      if (episodeIds.length) cards[id] = { ...card, episodeIds }
    }
    return { ...s, cards, decks: s.decks.filter((e) => e !== episodeId) }
  })
}

export function rateCard(id, rating, now = Date.now()) {
  setState((s) => {
    const card = s.cards[id]
    if (!card) return s
    const key = dayKey(now)
    const today = s.days[key] || { reviews: 0, learned: 0 }
    return {
      ...s,
      cards: { ...s.cards, [id]: schedule(card, rating, now) },
      days: {
        ...s.days,
        [key]: {
          reviews: today.reviews + 1,
          learned: today.learned + (card.state === 'new' ? 1 : 0),
        },
      },
    }
  })
}

/**
 * "I've forgotten this one" from the word list: treat it like an "Again"
 * answer, but due right away so the next session picks it up. It is not a
 * review, so the daily counts and the review count stay as they were.
 */
export function relearnCard(id, now = Date.now()) {
  setState((s) => {
    const card = s.cards[id]
    if (!card || card.state === 'new') return s
    const next = schedule(card, 'again', now)
    return {
      ...s,
      cards: {
        ...s.cards,
        [id]: { ...next, reps: card.reps, lastReview: card.lastReview, due: now },
      },
    }
  })
}

export function updateSettings(patch) {
  setState((s) => ({ ...s, settings: { ...s.settings, ...patch } }))
}

export function resetProgress() {
  setState(() => DEFAULT_STATE)
}

// ---------------------------------------------------------------------------
// Selectors — pure reads over a state snapshot.

/** Consecutive days with at least one review, ending today (or yesterday). */
export function streakOf(s, now) {
  let cursor = s.days[dayKey(now)]?.reviews ? now : addDays(now, -1)
  let streak = 0
  while (s.days[dayKey(cursor)]?.reviews) {
    streak++
    cursor = addDays(cursor, -1)
  }
  return streak
}

/**
 * Counts per garden stage, optionally for one episode, plus what is due and
 * what could be studied ahead of schedule (studied, but not due yet).
 */
export function summarize(s, now, episodeId = null) {
  const counts = { seed: 0, sprout: 0, bud: 0, bloom: 0, total: 0, due: 0, ahead: 0 }
  for (const card of Object.values(s.cards)) {
    if (episodeId !== null && !card.episodeIds.includes(episodeId)) continue
    counts[stageOf(card)]++
    counts.total++
    if (isDue(card, now)) counts.due++
    else if (card.state !== 'new') counts.ahead++
  }
  return counts
}

/**
 * Card ids for a study session: everything due, oldest first, with every new
 * card woven in — one after every few reviews, so a session is never a wall of
 * unfamiliar words at the end. There is no daily cap on new cards.
 *
 * When nothing is due and nothing is new, the session reviews ahead instead:
 * the studied cards, soonest-due first. So there is always something to study.
 */
export function buildQueue(s, now, episodeId = null) {
  const inScope = Object.values(s.cards).filter(
    (c) => episodeId === null || c.episodeIds.includes(episodeId),
  )
  const due = inScope.filter((c) => isDue(c, now)).sort((a, b) => a.due - b.due)
  const fresh = inScope
    .filter((c) => c.state === 'new')
    .sort((a, b) => a.addedAt - b.addedAt)

  const queue = []
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
export async function addEpisodeDeck(episode) {
  const res = await fetch(`./vocab/${episode.transcript_id}.json`)
  if (!res.ok) throw new Error('Vocabulary missing')
  const entries = await res.json()
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
export async function backfillCardContent(episodes) {
  if (backfillStarted) return
  backfillStarted = true

  const stale = Object.values(state.cards).filter((c) => !('def' in c))
  const episodeIds = [...new Set(stale.map((c) => c.episodeIds[0]))]
  if (episodeIds.length === 0) return

  const content = new Map()
  await Promise.all(
    episodeIds.map(async (id) => {
      const episode = episodes.find((e) => e.id === id)
      if (!episode) return
      try {
        const res = await fetch(`./vocab/${episode.transcript_id}.json`)
        if (!res.ok) return
        for (const entry of await res.json()) {
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
      if (!('def' in card) && content.has(id)) cards[id] = { ...card, ...content.get(id) }
    }
    return { ...s, cards }
  })
}

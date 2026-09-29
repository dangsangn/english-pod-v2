// Spaced-repetition scheduling (an SM-2 variant with Anki-style learning steps).
//
// Everything here is pure: a card goes in, a new card comes out. Persistence
// lives in srsStore.ts so this file can be reasoned about (and tested) alone.
//
// A card moves through four states:
//   new        → never studied
//   learning   → short steps measured in minutes until it "graduates"
//   review     → interval measured in days, grows by the ease factor
//   relearning → a lapsed review card going through short steps again

import type { VocabEntry } from '../types'

export type CardState = 'new' | 'learning' | 'review' | 'relearning'
export type Rating = 'again' | 'hard' | 'good' | 'easy'
/** Garden stage shown in the UI. */
export type Stage = 'seed' | 'sprout' | 'bud' | 'bloom'

/** The dictionary part of a card — everything that comes from the vocab file. */
export interface CardContent {
  word: string
  ipa: string
  type: string
  def: string
  vi: string
  viDef: string
}

export interface Card extends CardContent {
  id: string
  episodeIds: number[]
  state: CardState
  /** Index into the current learning or relearning steps. */
  step: number
  ease: number
  /** Days; 0 until the card first graduates. */
  interval: number
  due: number
  reps: number
  lapses: number
  addedAt: number
  lastReview: number | null
}

const MINUTE = 60 * 1000
const DAY = 24 * 60 * MINUTE

export const LEARNING_STEPS = [1 * MINUTE, 10 * MINUTE]
export const RELEARNING_STEPS = [10 * MINUTE]
const GRADUATING_INTERVAL = 1 // days, after the last learning step with "Good"
const EASY_INTERVAL = 4 // days, when a new card is marked "Easy"
const START_EASE = 2.5
const MIN_EASE = 1.3
const MAX_INTERVAL = 365 * 2

// Intervals of 21+ days count as "mature" — the card has bloomed.
export const MATURE_INTERVAL = 21

export const RATINGS: Rating[] = ['again', 'hard', 'good', 'easy']

export function createCard(entry: VocabEntry, episodeId: number, now: number): Card {
  return {
    id: cardId(entry.word),
    ...cardContent(entry),
    episodeIds: [episodeId],
    state: 'new',
    step: 0,
    ease: START_EASE,
    interval: 0,
    due: now,
    reps: 0,
    lapses: 0,
    addedAt: now,
    lastReview: null,
  }
}

/** The dictionary part of a card — everything that comes from the vocab file. */
export function cardContent(entry: VocabEntry): CardContent {
  return {
    word: entry.word,
    ipa: entry.ipa || '',
    type: entry.type || '',
    def: entry.def || '',
    vi: entry.vi || '',
    viDef: entry.viDef || '',
  }
}

/** One card per word: the same word appearing in several episodes is learnt once. */
export function cardId(word: string | null | undefined): string {
  return String(word ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
}

/** Return the card as it will be after answering with `rating` at `now`. */
export function schedule<C extends Card>(card: C, rating: Rating, now: number): C {
  const next: C = { ...card, reps: card.reps + 1, lastReview: now }

  if (card.state === 'new' || card.state === 'learning') {
    return stepThrough(next, rating, now, LEARNING_STEPS, () =>
      rating === 'easy' ? EASY_INTERVAL : GRADUATING_INTERVAL,
    )
  }

  if (card.state === 'relearning') {
    // Graduating out of relearning restores the (already shrunk) interval.
    return stepThrough(next, rating, now, RELEARNING_STEPS, () =>
      rating === 'easy' ? card.interval + 1 : card.interval,
    )
  }

  // Review card.
  const { interval, ease } = card

  // Studied ahead of schedule. Growing the interval from the full scheduled
  // interval would reward an early review as if the word had survived the
  // whole gap, so grow it from the time that actually passed instead — and
  // never let it shrink, since remembering early is still remembering.
  if (rating !== 'again' && card.due > endOfDay(now)) {
    const elapsed = Math.max(1, (now - (card.lastReview ?? now)) / DAY)
    const factor = { hard: 1.2, good: ease, easy: ease * 1.3 }[rating as Exclude<Rating, 'again'>]
    return toReview(next, Math.max(interval, elapsed * factor), ease, now)
  }

  switch (rating) {
    case 'again':
      return {
        ...next,
        state: 'relearning',
        step: 0,
        lapses: card.lapses + 1,
        ease: Math.max(MIN_EASE, ease - 0.2),
        interval: Math.max(1, Math.round(interval * 0.5)),
        due: now + RELEARNING_STEPS[0],
      }
    case 'hard':
      return toReview(next, Math.max(interval + 1, interval * 1.2), ease - 0.15, now)
    case 'good':
      return toReview(next, Math.max(interval + 1, interval * ease), ease, now)
    case 'easy':
      return toReview(next, Math.max(interval + 2, interval * ease * 1.3), ease + 0.15, now)
    default:
      throw new Error(`Unknown rating: ${rating satisfies never}`)
  }
}

function stepThrough<C extends Card>(
  card: C,
  rating: Rating,
  now: number,
  steps: number[],
  graduateInterval: () => number,
): C {
  const step = card.state === 'new' ? 0 : card.step
  const state: CardState = card.state === 'new' ? 'learning' : card.state

  switch (rating) {
    case 'again':
      return { ...card, state, step: 0, due: now + steps[0] }
    case 'hard': {
      // Anki's rule: on the first step, Hard waits halfway between the first
      // two steps; afterwards it repeats the current step.
      const delay =
        step === 0 && steps.length > 1 ? (steps[0] + steps[1]) / 2 : steps[step]
      return { ...card, state, step, due: now + delay }
    }
    case 'good':
      if (step + 1 < steps.length) {
        return { ...card, state, step: step + 1, due: now + steps[step + 1] }
      }
      return toReview(card, graduateInterval(), card.ease, now)
    case 'easy':
      return toReview(card, graduateInterval(), card.ease, now)
    default:
      throw new Error(`Unknown rating: ${rating satisfies never}`)
  }
}

function toReview<C extends Card>(card: C, interval: number, ease: number, now: number): C {
  const days = Math.min(MAX_INTERVAL, Math.max(1, Math.round(interval)))
  return {
    ...card,
    state: 'review',
    step: 0,
    ease: Math.max(MIN_EASE, ease),
    interval: days,
    // Review cards come due at the start of their day, so a card studied in the
    // evening is not held back until the evening of the due day.
    due: startOfDay(now) + days * DAY,
  }
}

/** Is the card waiting to be studied by the end of `now`'s day? */
export function isDue(card: Card, now: number): boolean {
  if (card.state === 'new') return false
  if (card.state === 'review') return card.due <= endOfDay(now)
  return card.due <= now
}

/** Garden stage shown in the UI. */
export function stageOf(card: Card): Stage {
  if (card.state === 'new') return 'seed'
  if (card.state === 'learning' || card.state === 'relearning') return 'sprout'
  if (card.interval < MATURE_INTERVAL) return 'bud'
  return 'bloom'
}

/** Short human label for a delay, e.g. "<1 phút", "10 phút", "4 ngày", "2 th". */
export function formatDelay(ms: number): string {
  if (ms < MINUTE) return '<1 phút'
  if (ms < 60 * MINUTE) return `${Math.round(ms / MINUTE)} phút`
  if (ms < DAY) return `${Math.round(ms / (60 * MINUTE))} giờ`
  const days = Math.round(ms / DAY)
  if (days < 30) return `${days} ngày`
  if (days < 365) return `${Math.round(days / 30)} tháng`
  return `${(days / 365).toFixed(1).replace(/\.0$/, '')} năm`
}

/** How long until the card would come back after `rating`, for button hints. */
export function previewDelay(card: Card, rating: Rating, now: number): number {
  const next = schedule(card, rating, now)
  if (next.state === 'review') return next.interval * DAY
  return next.due - now
}

export function startOfDay(ms: number): number {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export function endOfDay(ms: number): number {
  return startOfDay(ms) + DAY - 1
}

/** Local calendar date as YYYY-MM-DD — the key for daily stats. */
export function dayKey(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function addDays(ms: number, days: number): number {
  const d = new Date(ms)
  d.setDate(d.getDate() + days)
  return d.getTime()
}

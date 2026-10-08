// Example sentences for vocabulary cards (see
// docs/superpowers/specs/2026-10-06-vocab-in-context-design.md).
//
// They ship inside each deck's vocab file rather than on the cards, so the
// stored progress and the sync protocol are untouched. A session loads the
// files of the episodes its cards come from; they stay cached in memory.

import { useEffect, useState } from 'react'
import type { Collocation, VocabEntry } from '../types'
import { cardId } from './srs.ts'
import type { Card } from './srs'
import { vocabFile } from './coreDecks.ts'

export interface Example {
  /** One English sentence. */
  ex: string
  /** The word as it occurs in `ex`. */
  hit: string
  /** Vietnamese translation of `ex`. */
  vi: string
  /** The episode `ex` comes from, when the deck is not that episode (Top 1000). */
  ep?: number
}

/** What a Top 1000 file adds to a word besides its example. */
interface Extras {
  syn?: string[]
  col?: Collocation[]
}

const loaded = new Map<number, Map<string, Example>>()
const extras = new Map<number, Map<string, Extras>>()
const loading = new Map<number, Promise<void>>()

function load(deckId: number): Promise<void> {
  const pending = loading.get(deckId)
  if (pending) return pending
  const file = vocabFile(deckId)
  const promise = fetch(file)
    .then((res) => {
      if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`)
      return res.json() as Promise<VocabEntry[]>
    })
    .then((entries) => {
      const examples = new Map<string, Example>()
      const more = new Map<string, Extras>()
      for (const e of entries) {
        const id = cardId(e.word)
        if (e.ex && e.exHit && e.exVi && !examples.has(id)) {
          examples.set(id, {
            ex: e.ex,
            hit: e.exHit,
            vi: e.exVi,
            ...(e.exEp ? { ep: e.exEp } : {}),
          })
        }
        if ((e.syn?.length || e.col?.length) && !more.has(id))
          more.set(id, { syn: e.syn, col: e.col })
      }
      loaded.set(deckId, examples)
      extras.set(deckId, more)
    })
    .catch(() => {
      // Offline or missing: the cards go without examples, and a later
      // session tries again.
      loading.delete(deckId)
    })
  loading.set(deckId, promise)
  return promise
}

export function loadExamples(deckIds: number[]): Promise<void> {
  return Promise.all([...new Set(deckIds)].map(load)).then(() => undefined)
}

/** The card's example from the first of its decks that has one loaded. */
export function exampleOf(card: Pick<Card, 'id' | 'episodeIds'>): Example | null {
  for (const id of card.episodeIds) {
    const example = loaded.get(id)?.get(card.id)
    if (example) return example
  }
  return null
}

/** `pick` from the first of the card's decks that has some (only Top 1000 files carry extras). */
function firstExtra<T>(
  card: Pick<Card, 'id' | 'episodeIds'>,
  pick: (x: Extras) => T[] | undefined,
): T[] {
  for (const id of card.episodeIds) {
    const found = pick(extras.get(id)?.get(card.id) ?? {})
    if (found?.length) return found
  }
  return []
}

export function synonymsOf(card: Pick<Card, 'id' | 'episodeIds'>): string[] {
  return firstExtra(card, (x) => x.syn)
}

export function collocationsOf(card: Pick<Card, 'id' | 'episodeIds'>): Collocation[] {
  return firstExtra(card, (x) => x.col)
}

/** Every episode the cards come from, once. Missing cards are skipped. */
export function episodeIdsOf(cards: (Pick<Card, 'episodeIds'> | undefined)[]): number[] {
  return [...new Set(cards.flatMap((c) => c?.episodeIds ?? []))]
}

// Stop waiting after this long, so a stalled network never blocks a session.
const EXAMPLES_TIMEOUT_MS = 8000

/**
 * Load the examples of `episodeIds`. True once every file has loaded (or
 * failed) or the wait times out. It only gates the waiting: examples that
 * arrive after the timeout stay cached and later questions may still use them
 * (GameSession reads exampleOf per question), while StudySession gates its
 * render on `ready`. Read examples with `ready ? exampleOf(card) : null` so
 * the render depends on it — the cache itself is not React state.
 */
export function useExamples(episodeIds: number[]): boolean {
  const key = [...new Set(episodeIds)].sort((a, b) => a - b).join(',')
  const [readyKey, setReadyKey] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    const ready = () => {
      if (live) setReadyKey(key)
    }
    loadExamples(key ? key.split(',').map(Number) : []).then(ready)
    const timer = setTimeout(ready, EXAMPLES_TIMEOUT_MS)
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [key])
  return readyKey === key
}

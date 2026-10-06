// Example sentences for vocabulary cards (see
// docs/superpowers/specs/2026-10-06-vocab-in-context-design.md).
//
// They ship inside each episode's vocab file rather than on the cards, so the
// stored progress and the sync protocol are untouched. A session loads the
// files of the episodes its cards come from; they stay cached in memory.

import { useEffect, useState } from 'react'
import type { VocabEntry } from '../types'
import { cardId } from './srs'
import type { Card } from './srs'

export interface Example {
  /** One English sentence. */
  ex: string
  /** The word as it occurs in `ex`. */
  hit: string
  /** Vietnamese translation of `ex`. */
  vi: string
}

const loaded = new Map<number, Map<string, Example>>()
const loading = new Map<number, Promise<void>>()

function load(episodeId: number): Promise<void> {
  const pending = loading.get(episodeId)
  if (pending) return pending
  const file = `./vocab/englishpod_${String(episodeId).padStart(4, '0')}.json`
  const promise = fetch(file)
    .then((res) => {
      if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`)
      return res.json() as Promise<VocabEntry[]>
    })
    .then((entries) => {
      const examples = new Map<string, Example>()
      for (const e of entries) {
        const id = cardId(e.word)
        if (e.ex && e.exHit && e.exVi && !examples.has(id)) {
          examples.set(id, { ex: e.ex, hit: e.exHit, vi: e.exVi })
        }
      }
      loaded.set(episodeId, examples)
    })
    .catch(() => {
      // Offline or missing: the cards go without examples, and a later
      // session tries again.
      loading.delete(episodeId)
    })
  loading.set(episodeId, promise)
  return promise
}

export function loadExamples(episodeIds: number[]): Promise<void> {
  return Promise.all([...new Set(episodeIds)].map(load)).then(() => undefined)
}

/** The card's example from the first of its episodes that has one loaded. */
export function exampleOf(card: Pick<Card, 'id' | 'episodeIds'>): Example | null {
  for (const id of card.episodeIds) {
    const example = loaded.get(id)?.get(card.id)
    if (example) return example
  }
  return null
}

/** Every episode the cards come from, once. Missing cards are skipped. */
export function episodeIdsOf(cards: (Pick<Card, 'episodeIds'> | undefined)[]): number[] {
  return [...new Set(cards.flatMap((c) => c?.episodeIds ?? []))]
}

/**
 * Load the examples of `episodeIds`. True once every file has loaded (or
 * failed). Read examples with `ready ? exampleOf(card) : null` so the render
 * depends on it — the cache itself is not React state.
 */
export function useExamples(episodeIds: number[]): boolean {
  const key = [...new Set(episodeIds)].sort((a, b) => a - b).join(',')
  const [readyKey, setReadyKey] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    loadExamples(key ? key.split(',').map(Number) : []).then(() => {
      if (live) setReadyKey(key)
    })
    return () => {
      live = false
    }
  }, [key])
  return readyKey === key
}

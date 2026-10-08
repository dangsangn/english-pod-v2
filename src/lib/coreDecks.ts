// The Top 1000 decks: the most common content words of conversation, in ten
// groups of 100 (see docs/superpowers/specs/2026-10-08-core-1000-words-design.md).
//
// They share the number space of episode decks — the store, the sync protocol
// and the server only ever see a deck id — so they take ids above any episode.

export const CORE_BASE = 10000
export const CORE_GROUPS = 10
export const CORE_GROUP_SIZE = 100
export const CORE_DECK_IDS = Array.from({ length: CORE_GROUPS }, (_, i) => CORE_BASE + i + 1)

export function isCoreDeck(id: number): boolean {
  return id > CORE_BASE && id <= CORE_BASE + CORE_GROUPS
}

/** 1 for the first hundred words, … 10 for the last. */
export function coreGroup(id: number): number {
  return id - CORE_BASE
}

/** "Top 1000 · 101–200". */
export function coreDeckName(id: number): string {
  const group = coreGroup(id)
  return `Top 1000 · ${(group - 1) * CORE_GROUP_SIZE + 1}–${group * CORE_GROUP_SIZE}`
}

/** The static file with a deck's words: an episode's vocabulary or a Top 1000 group. */
export function vocabFile(id: number): string {
  return isCoreDeck(id)
    ? `./core/core_${String(coreGroup(id)).padStart(2, '0')}.json`
    : `./vocab/englishpod_${String(id).padStart(4, '0')}.json`
}

// The episode's vocabulary in its dialogue: each word sits in the line its
// example sentence was taken from (scripts/data/vocab-ex, src "dialogue").
// Written sentences are not in the dialogue and find nothing, by design.
//
// Transcripts sometimes glue words together ("wantyou") or use curly
// apostrophes, while example sentences are stored with single spaces and
// straight ones. So matching ignores whitespace and folds apostrophes — the
// rule scripts/verify_examples.js checks the data with — but every position
// returned is an offset into the original text, for the DOM pass to wrap.

import { hitIndex } from './quiz.ts'
import type { VocabEntry } from '../types'

export interface HitRange {
  /** [start, end) in the line's text. */
  start: number
  end: number
  entry: VocabEntry
}

const SPACE = /\s/
const fold = (c: string) => (c === '’' || c === '‘' || c === 'ʼ' ? "'" : c)

/** The text without whitespace, apostrophes folded, and where each kept character was. */
function squash(text: string): { chars: string; at: number[] } {
  let chars = ''
  const at: number[] = []
  for (let i = 0; i < text.length; i++) {
    if (SPACE.test(text[i])) continue
    chars += fold(text[i])
    at.push(i)
  }
  return { chars, at }
}

/**
 * Where the entries' words are in one dialogue line: for each entry whose
 * example sentence is in the line, its `exHit`. Sorted, never overlapping —
 * of two overlapping hits the earlier one stays (the longer, on a tie).
 */
export function findHits(text: string, entries: VocabEntry[]): HitRange[] {
  const line = squash(text)
  const hits: HitRange[] = []
  for (const entry of entries) {
    if (!entry.ex || !entry.exHit) continue
    const sentence = squash(entry.ex).chars
    const from = sentence ? line.chars.indexOf(sentence) : -1
    const hitAt = hitIndex(entry.ex, entry.exHit)
    const length = squash(entry.exHit).chars.length
    if (from < 0 || hitAt < 0 || !length) continue
    // The non-space characters before the hit in the sentence: as many come
    // before it in the line, counted from where the sentence starts.
    const skip = squash(entry.ex.slice(0, hitAt)).chars.length
    hits.push({
      start: line.at[from + skip],
      end: line.at[from + skip + length - 1] + 1,
      entry,
    })
  }
  hits.sort((a, b) => a.start - b.start || b.end - a.end)
  const kept: HitRange[] = []
  for (const hit of hits) {
    if (!kept.length || hit.start >= kept[kept.length - 1].end) kept.push(hit)
  }
  return kept
}

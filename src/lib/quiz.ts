// Questions for the vocabulary games (see
// docs/superpowers/specs/2026-09-28-vocab-games-design.md).
//
// Everything here is pure: cards and a random source go in, questions come
// out. The components in src/components/vocab render them, and
// scripts/verify_quiz.js checks them against every vocab file.
//
// Five kinds of question, chosen by the card's garden stage (KINDS_BY_STAGE):
//   meaning   → the word is shown, pick its meaning among up to 4
//   listen    → the word is spoken, pick how it is written among up to 4
//   spell     → the meaning is shown, type the word into letter cells
//   cloze     → the example sentence with the word blanked out, type it
//   dictation → the example sentence is spoken, type the whole sentence

// With the extension: scripts/verify_quiz.js runs this file in Node, which
// does not resolve extensionless imports (tsconfig allows .ts imports).
import { stageOf } from './srs.ts'
import type { Card, Rating, Stage } from './srs'

export type QuestionKind = 'meaning' | 'spell' | 'listen' | 'cloze' | 'dictation'

export type Question =
  | { kind: 'spell' | 'cloze' | 'dictation' }
  | { kind: 'meaning' | 'listen'; options: string[]; answerIndex: number }

/** A cell of a word being spelled: a letter to type, or a mark shown as is. */
export type SpellToken =
  { type: 'letter'; char: string; index: number } | { type: 'mark'; char: string }

/** Only what the questions read from a card. */
export type QuizCard = Pick<
  Card,
  'id' | 'word' | 'type' | 'vi' | 'def' | 'episodeIds' | 'state' | 'interval'
>

/** What a card offers beyond its own fields. */
export interface QuizContext {
  canSpeak: boolean
  /** The card has an example sentence (cloze and dictation need one). */
  hasExample?: boolean
}

type Rng = () => number

// Recognition first, recall later: a word is only asked to be typed once it
// has been seen, and only asked in a sentence once it is being remembered.
const KINDS_BY_STAGE: Record<Stage, QuestionKind[]> = {
  seed: ['meaning', 'listen'],
  sprout: ['meaning', 'listen', 'spell'],
  bud: ['listen', 'spell', 'cloze'],
  bloom: ['cloze', 'dictation'],
}
const STAGE_ORDER: Stage[] = ['seed', 'sprout', 'bud', 'bloom']

// Fewer cards than this in the whole garden cannot make a 4-option question.
export const MIN_POOL = 4

const MAX_CHOICES = 4
const MIN_CHOICES = 2
// The same kind of question at most this many times in a row.
const MAX_RUN = 2

/** What is shown as the meaning: the Vietnamese one, else the English one. */
export function meaningOf(card: Pick<Card, 'vi' | 'def'>): string {
  return String(card.vi || card.def || '').trim()
}

/** Lower case, punctuation dropped, spaces collapsed; diacritics are kept. */
export function comparable(text: string | null | undefined): string {
  return String(text ?? '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** "chộp lấy, vơ lấy" → ["chộp lấy", "vơ lấy"]. */
function senses(text: string): string[] {
  return String(text).split(/[,;]/).map(comparable).filter(Boolean)
}

function shuffle<T>(items: T[], rng: Rng): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/**
 * The kinds that can be asked about this card: those of its stage that it can
 * support, or — when none can — those of the stage before, and so on.
 */
export function allowedKinds(
  card: QuizCard,
  { canSpeak, hasExample = false }: QuizContext,
): QuestionKind[] {
  const hasMeaning = meaningOf(card) !== ''
  const usable = (kind: QuestionKind) => {
    switch (kind) {
      case 'listen':
        return canSpeak
      case 'meaning':
      case 'spell':
        return hasMeaning
      case 'cloze':
        return hasExample && hasMeaning
      case 'dictation':
        return hasExample && canSpeak
      default:
        throw new Error(`Unknown kind: ${kind satisfies never}`)
    }
  }
  for (let i = STAGE_ORDER.indexOf(stageOf(card)); i >= 0; i--) {
    const kinds = KINDS_BY_STAGE[STAGE_ORDER[i]].filter(usable)
    if (kinds.length) return kinds
  }
  return []
}

/** One of `kinds`, avoiding a third question of the same kind in a row. */
export function pickKind(
  kinds: QuestionKind[],
  recentKinds: QuestionKind[],
  rng: Rng = Math.random,
): QuestionKind {
  const last = recentKinds.slice(-MAX_RUN)
  let choices = kinds
  if (last.length === MAX_RUN && last.every((k) => k === last[0])) {
    const others = kinds.filter((k) => k !== last[0])
    if (others.length) choices = others
  }
  return choices[Math.floor(rng() * choices.length)]
}

/**
 * The options for a 'meaning' or 'listen' question about `card` (field
 * 'meaning' or 'word'), shuffled.
 * Distractors come from the card's own episode first, then from words of the
 * same type, then from anywhere in `pool`. An option that means the same as the
 * answer (same text, or a shared sense like "chọn" in "lựa chọn, chọn") is
 * skipped, so a sensible pick is never marked wrong.
 */
export function buildChoices(
  card: QuizCard,
  pool: QuizCard[],
  field: 'meaning' | 'word',
  rng: Rng = Math.random,
): { options: string[]; answerIndex: number } {
  const valueOf = field === 'meaning' ? meaningOf : (c: QuizCard) => String(c.word)
  const answer = valueOf(card)
  // Words are told apart by their letters alone: "break down" and "breakdown"
  // sound the same, so a listening question must not offer both.
  const keyOf = field === 'meaning' ? comparable : lettersOf
  const taken = new Set([keyOf(answer)])
  const answerSenses = new Set(field === 'meaning' ? senses(answer) : [])

  const others = pool.filter((c) => c.id !== card.id)
  const sameEpisode = (c: QuizCard) => c.episodeIds.some((id) => card.episodeIds.includes(id))
  const tiers = [
    others.filter(sameEpisode),
    others.filter((c) => !sameEpisode(c) && card.type && c.type === card.type),
    others,
  ]

  const wrong: string[] = []
  for (const tier of tiers) {
    if (wrong.length === MAX_CHOICES - 1) break
    for (const c of shuffle(tier, rng)) {
      if (wrong.length === MAX_CHOICES - 1) break
      const value = valueOf(c)
      const key = keyOf(value)
      if (!key || taken.has(key)) continue
      if (senses(value).some((s) => answerSenses.has(s))) continue
      taken.add(key)
      wrong.push(value)
    }
  }

  const options = shuffle([answer, ...wrong], rng)
  return { options, answerIndex: options.indexOf(answer) }
}

/**
 * The question to ask about `card`, or null when none can be asked (no
 * meaning, no speech, no example). A choice question that cannot get two options falls
 * back to another kind.
 */
export function makeQuestion(
  card: QuizCard,
  pool: QuizCard[],
  recentKinds: QuestionKind[],
  context: QuizContext,
  rng: Rng = Math.random,
): Question | null {
  let kinds = allowedKinds(card, context)
  while (kinds.length) {
    const kind = pickKind(kinds, recentKinds, rng)
    if (kind === 'spell' || kind === 'cloze' || kind === 'dictation') return { kind }
    const field = kind === 'meaning' ? 'meaning' : 'word'
    const { options, answerIndex } = buildChoices(card, pool, field, rng)
    if (options.length >= MIN_CHOICES) return { kind, options, answerIndex }
    kinds = kinds.filter((k) => k !== kind)
  }
  return null
}

/**
 * The letter cells for spelling `word`: one array per word of the phrase, each
 * a list of tokens. Letters (and digits) are cells to type, numbered by their
 * position in lettersOf(word); anything else ("'", "-", ".") is shown as is.
 */
export function maskWord(word: string | null | undefined): SpellToken[][] {
  let index = 0
  return String(word ?? '')
    .normalize('NFC')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) =>
      [...part].map((char) =>
        /[\p{L}\p{N}]/u.test(char)
          ? { type: 'letter' as const, char, index: index++ }
          : { type: 'mark' as const, char },
      ),
    )
}

/** Only the letters and digits, lower case: what the learner has to type. */
export function lettersOf(text: string | null | undefined): string {
  return String(text ?? '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '')
}

export function checkSpelling(input: string, word: string): boolean {
  const want = lettersOf(word)
  return want !== '' && lettersOf(input) === want
}

/** How a game answer is scheduled, in the flashcard ratings of srs.ts. */
export function gradeFor({
  correct,
  hinted = false,
  attempts = 1,
}: {
  correct: boolean
  hinted?: boolean
  attempts?: number
}): Rating {
  if (!correct) return 'again'
  return hinted || attempts > 1 ? 'hard' : 'good'
}

export type DictationStatus = 'ok' | 'missed' | 'extra'

export interface DictationWord {
  text: string
  /** ok: typed right · missed: in the sentence, not typed · extra: typed, not in the sentence */
  status: DictationStatus
  /** Part of the card's own word (the example's `hit`). */
  target: boolean
}

export interface DictationResult {
  words: DictationWord[]
  /** Every word of the card's own word was typed. This alone decides the rating. */
  targetCorrect: boolean
  /** Share of the sentence's words typed right, 0–1. */
  accuracy: number
}

/** The words of a sentence as written, with where each sits. */
function wordsOf(text: string) {
  return [
    ...String(text)
      .normalize('NFC')
      .matchAll(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu),
  ].map((m) => ({ text: m[0], start: m.index, end: m.index + m[0].length }))
}

/**
 * Where `hit` starts in `text` as whole words — not inside a longer word, so
 * "go" is not found in "ago" — or -1. Falls back to a plain match when no
 * whole-word one exists.
 */
export function hitIndex(text: string, hit: string): number {
  if (!hit) return -1
  for (let at = text.indexOf(hit); at >= 0; at = text.indexOf(hit, at + 1)) {
    const before = text.charAt(at - 1)
    const after = text.charAt(at + hit.length)
    if (!/[\p{L}\p{N}']/u.test(before) && !/[\p{L}\p{N}]/u.test(after)) return at
  }
  return text.indexOf(hit)
}

/**
 * Every whole-word occurrence of `hit` in `text` as [start, end) ranges, for
 * blanking a cloze. Unlike hitIndex it ignores case, so "Right on, right on!"
 * blanks both. Falls back to hitIndex's plain match when none is a whole word.
 */
export function hitRanges(text: string, hit: string): [number, number][] {
  if (!hit) return []
  const lower = text.toLowerCase()
  const want = hit.toLowerCase()
  const ranges: [number, number][] = []
  if (lower.length === text.length && want.length === hit.length) {
    for (let at = lower.indexOf(want); at >= 0; at = lower.indexOf(want, at + want.length)) {
      const before = text.charAt(at - 1)
      const after = text.charAt(at + want.length)
      if (!/[\p{L}\p{N}']/u.test(before) && !/[\p{L}\p{N}]/u.test(after)) {
        ranges.push([at, at + want.length])
      }
    }
  }
  if (ranges.length) return ranges
  const at = hitIndex(text, hit)
  return at < 0 ? [] : [[at, at + hit.length]]
}

const wordKey = (word: string) => word.toLowerCase().replace(/[’ʼ‘]/g, "'")

/**
 * Grade a dictation word by word: case and punctuation do not count. The
 * typed words are lined up with the sentence's by their longest common
 * subsequence, so one missing or extra word does not throw off the rest.
 */
export function gradeDictation(input: string, sentence: string, hit: string): DictationResult {
  const text = sentence.normalize('NFC')
  const want = wordsOf(text)
  const got = wordsOf(input)
  const target = hit.normalize('NFC')
  const hitStart = hitIndex(text, target)
  const hitEnd = hitStart + target.length
  const isTarget = (w: { start: number; end: number }) =>
    hitStart >= 0 && w.start < hitEnd && w.end > hitStart

  // lcs[i][j]: longest common run of want[i..] and got[j..].
  const lcs = Array.from({ length: want.length + 1 }, () =>
    new Array<number>(got.length + 1).fill(0),
  )
  for (let i = want.length - 1; i >= 0; i--) {
    for (let j = got.length - 1; j >= 0; j--) {
      lcs[i][j] =
        wordKey(want[i].text) === wordKey(got[j].text)
          ? lcs[i + 1][j + 1] + 1
          : Math.max(lcs[i + 1][j], lcs[i][j + 1])
    }
  }

  const words: DictationWord[] = []
  let i = 0
  let j = 0
  while (i < want.length || j < got.length) {
    if (i < want.length && j < got.length && wordKey(want[i].text) === wordKey(got[j].text)) {
      words.push({ text: want[i].text, status: 'ok', target: isTarget(want[i]) })
      i++
      j++
    } else if (j < got.length && (i === want.length || lcs[i][j + 1] >= lcs[i + 1][j])) {
      words.push({ text: got[j].text, status: 'extra', target: false })
      j++
    } else {
      words.push({ text: want[i].text, status: 'missed', target: isTarget(want[i]) })
      i++
    }
  }

  const targets = words.filter((w) => w.target)
  const right = words.filter((w) => w.status === 'ok').length
  return {
    words,
    targetCorrect: targets.length > 0 && targets.every((w) => w.status === 'ok'),
    accuracy: want.length ? right / want.length : 0,
  }
}

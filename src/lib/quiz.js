// Questions for the vocabulary games (see
// docs/superpowers/specs/2026-09-28-vocab-games-design.md).
//
// Everything here is pure: cards and a random source go in, questions come
// out. The components in src/components/vocab render them, and
// scripts/verify_quiz.js checks them against every vocab file.
//
// Three kinds of question:
//   meaning → the word is shown, pick its meaning among up to 4
//   spell   → the meaning is shown, type the word into letter cells
//   listen  → the word is spoken, pick how it is written among up to 4

export const KINDS = ['meaning', 'spell', 'listen']

// Fewer cards than this in the whole garden cannot make a 4-option question.
export const MIN_POOL = 4

const MAX_CHOICES = 4
const MIN_CHOICES = 2
// The same kind of question at most this many times in a row.
const MAX_RUN = 2

/** What is shown as the meaning: the Vietnamese one, else the English one. */
export function meaningOf(card) {
  return String(card.vi || card.def || '').trim()
}

/** Lower case, punctuation dropped, spaces collapsed; diacritics are kept. */
export function comparable(text) {
  return String(text ?? '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** "chộp lấy, vơ lấy" → ["chộp lấy", "vơ lấy"]. */
function senses(text) {
  return String(text).split(/[,;]/).map(comparable).filter(Boolean)
}

function shuffle(items, rng) {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/**
 * The kinds that can be asked about this card. A new card only gets the
 * recognition kinds; spelling waits until it has been studied once.
 */
export function allowedKinds(card, { canSpeak }) {
  const hasMeaning = meaningOf(card) !== ''
  const kinds = card.state === 'new' ? ['meaning', 'listen'] : KINDS
  return kinds.filter((kind) => (kind === 'listen' ? canSpeak : hasMeaning))
}

/** One of `kinds`, avoiding a third question of the same kind in a row. */
export function pickKind(kinds, recentKinds, rng = Math.random) {
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
export function buildChoices(card, pool, field, rng = Math.random) {
  const valueOf = field === 'meaning' ? meaningOf : (c) => String(c.word)
  const answer = valueOf(card)
  // Words are told apart by their letters alone: "break down" and "breakdown"
  // sound the same, so a listening question must not offer both.
  const keyOf = field === 'meaning' ? comparable : lettersOf
  const taken = new Set([keyOf(answer)])
  const answerSenses = new Set(field === 'meaning' ? senses(answer) : [])

  const others = pool.filter((c) => c.id !== card.id)
  const sameEpisode = (c) => c.episodeIds.some((id) => card.episodeIds.includes(id))
  const tiers = [
    others.filter(sameEpisode),
    others.filter((c) => !sameEpisode(c) && card.type && c.type === card.type),
    others,
  ]

  const wrong = []
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
 * meaning and no speech). A choice question that cannot get two options falls
 * back to another kind.
 */
export function makeQuestion(card, pool, recentKinds, { canSpeak }, rng = Math.random) {
  let kinds = allowedKinds(card, { canSpeak })
  while (kinds.length) {
    const kind = pickKind(kinds, recentKinds, rng)
    if (kind === 'spell') return { kind }
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
export function maskWord(word) {
  let index = 0
  return String(word ?? '')
    .normalize('NFC')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) =>
      [...part].map((char) =>
        /[\p{L}\p{N}]/u.test(char)
          ? { type: 'letter', char, index: index++ }
          : { type: 'mark', char },
      ),
    )
}

/** Only the letters and digits, lower case: what the learner has to type. */
export function lettersOf(text) {
  return String(text ?? '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '')
}

export function checkSpelling(input, word) {
  const want = lettersOf(word)
  return want !== '' && lettersOf(input) === want
}

/** How a game answer is scheduled, in the flashcard ratings of srs.js. */
export function gradeFor({ correct, hinted = false, attempts = 1 }) {
  if (!correct) return 'again'
  return hinted || attempts > 1 ? 'hard' : 'good'
}

# Vocabulary Games Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Chơi" mode to the vocabulary garden that quizzes each due/new card with one of three question kinds (pick the meaning, spell the word, listen and pick the word) and feeds the result into the existing SRS schedule.

**Architecture:** A pure module `src/lib/quiz.js` builds questions (kind choice, distractors, letter cells, grading) and is checked by `scripts/verify_quiz.js` against every vocab file. A new `GameSession` screen reuses the flashcard queue (`buildQueue`), scheduling (`schedule`/`rateCard`), requeue rule and `SessionSummary`; the progress header is extracted from `StudySession` into `SessionHeader` so both screens share it. Routes `#vocab/play` and `#vocab/play/<episodeId>` mirror `#vocab/study`.

**Tech Stack:** React 19 (with React Compiler), Tailwind 4, lucide-react, Web Speech API via `src/lib/speech.js`. No test framework (by the user's choice): verification is a Node script plus driving the app.

**Spec:** `docs/superpowers/specs/2026-09-28-vocab-games-design.md`

**Environment notes:**
- `npm run dev` needs Node 22: run `source ~/.nvm/nvm.sh && nvm use 22.18.0` first. Node scripts (`node scripts/...`) and `npm run lint` work on the default Node.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

---

## File structure

| File | Status | Responsibility |
| --- | --- | --- |
| `src/lib/quiz.js` | Create | Pure question logic: `meaningOf`, `comparable`, `allowedKinds`, `pickKind`, `buildChoices`, `makeQuestion`, `maskWord`, `lettersOf`, `checkSpelling`, `gradeFor`, `MIN_POOL`. |
| `scripts/verify_quiz.js` | Create | Runs `quiz.js` over every `public/vocab/*.json` and checks invariants. |
| `src/lib/speech.js` | Modify | Export `canSpeak`. |
| `src/components/vocab/SessionHeader.jsx` | Create | Exit button, progress bar, new/learning/review counters. |
| `src/components/vocab/StudySession.jsx` | Modify | Use `SessionHeader`. |
| `src/components/vocab/QuestionParts.jsx` | Create | `QuestionCard` frame and `ContinueButton` result bar, shared by both question components. |
| `src/components/vocab/ChoiceQuestion.jsx` | Create | "Chọn nghĩa" and "Nghe → chọn từ". |
| `src/components/vocab/SpellQuestion.jsx` | Create | "Điền từ". |
| `src/index.css` | Modify | `vocab-shake` animation. |
| `src/components/vocab/GameSession.jsx` | Create | Queue, question per card, grading, requeue, stats. |
| `src/components/vocab/VocabApp.jsx` | Modify | `play` route. |
| `src/components/vocab/VocabHome.jsx` | Modify | "Chơi" buttons. |

---

### Task 1: Question logic and its verification script

**Files:**
- Create: `scripts/verify_quiz.js`
- Create: `src/lib/quiz.js`

- [ ] **Step 1: Write the verification script**

Create `scripts/verify_quiz.js`:

```js
/**
 * Checks the vocabulary games' questions (src/lib/quiz.js) against every
 * generated vocab file, building them the way the app does. Reports each
 * problem by word so it can be looked at directly.
 *
 * Usage:
 *   node scripts/verify_quiz.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { cardId } from '../src/lib/srs.js';
import {
    allowedKinds,
    buildChoices,
    checkSpelling,
    comparable,
    gradeFor,
    lettersOf,
    makeQuestion,
    maskWord,
    meaningOf,
    pickKind,
} from '../src/lib/quiz.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const VOCAB_DIR = path.resolve(__dirname, '../public/vocab');

// Seeded, so a failure can be reproduced run after run.
function mulberry32(seed) {
    return () => {
        seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const problems = [];
const fail = (message) => problems.push(message);

/** One card per word, as srsStore does when several decks share a word. */
function loadCards() {
    const cards = new Map();
    const files = fs.readdirSync(VOCAB_DIR).filter((f) => f.endsWith('.json')).sort();
    for (const file of files) {
        const episodeId = Number(/(\d+)\.json$/.exec(file)[1]);
        const entries = JSON.parse(fs.readFileSync(path.join(VOCAB_DIR, file), 'utf-8'));
        for (const entry of entries) {
            const id = cardId(entry.word);
            if (!id) continue;
            const existing = cards.get(id);
            if (existing) {
                if (!existing.episodeIds.includes(episodeId)) existing.episodeIds.push(episodeId);
                continue;
            }
            cards.set(id, {
                id,
                word: entry.word,
                ipa: entry.ipa || '',
                type: entry.type || '',
                def: entry.def || '',
                vi: entry.vi || '',
                viDef: entry.viDef || '',
                episodeIds: [episodeId],
                state: 'review',
            });
        }
    }
    return [...cards.values()];
}

function checkChoices(card, pool, field, rng, expectFull) {
    const where = `"${card.word}" (${field})`;
    const { options, answerIndex } = buildChoices(card, pool, field, rng);
    const answer = field === 'meaning' ? meaningOf(card) : card.word;
    if (options[answerIndex] !== answer) fail(`${where}: answer is not at answerIndex`);
    const keys = options.map(comparable);
    if (new Set(keys).size !== keys.length) {
        fail(`${where}: duplicate options ${JSON.stringify(options)}`);
    }
    if (expectFull && options.length !== 4) {
        fail(`${where}: only ${options.length} options from the whole garden`);
    }
    return options.length;
}

function checkSpellingOf(card) {
    const where = `"${card.word}" (spell)`;
    const letters = lettersOf(card.word);
    if (!letters) {
        fail(`${where}: no letters to type`);
        return;
    }
    const cells = maskWord(card.word).flat().filter((t) => t.type === 'letter');
    if (cells.length !== letters.length) {
        fail(`${where}: ${cells.length} cells for ${letters.length} letters`);
    }
    if (cells.some((t, i) => t.index !== i)) fail(`${where}: cell indexes out of order`);
    if (!checkSpelling(card.word, card.word)) fail(`${where}: the word itself is rejected`);
    if (!checkSpelling(`  ${card.word.toUpperCase()} `, card.word)) {
        fail(`${where}: upper case / extra spaces rejected`);
    }
    if (checkSpelling(`${card.word}x`, card.word)) fail(`${where}: an extra letter is accepted`);
}

function checkRules(rng) {
    const newCard = { id: 'n', word: 'grab', vi: 'chộp lấy', def: '', state: 'new', episodeIds: [1] };
    if (allowedKinds(newCard, { canSpeak: true }).includes('spell')) {
        fail('rules: a new card may be asked to spell');
    }
    const silentEmpty = { ...newCard, vi: '', state: 'review' };
    if (allowedKinds(silentEmpty, { canSpeak: false }).length !== 0) {
        fail('rules: a card without meaning or speech still gets a kind');
    }
    if (makeQuestion(silentEmpty, [silentEmpty], [], { canSpeak: false }, rng) !== null) {
        fail('rules: makeQuestion should give up on a card nothing can be asked about');
    }
    for (let i = 0; i < 200; i++) {
        if (pickKind(['meaning', 'spell', 'listen'], ['spell', 'spell'], rng) === 'spell') {
            fail('rules: the same kind came up three times in a row');
            break;
        }
    }
    if (pickKind(['spell'], ['spell', 'spell'], rng) !== 'spell') {
        fail('rules: the only allowed kind must still be picked');
    }
    const grades = [
        [{ correct: true }, 'good'],
        [{ correct: true, hinted: true }, 'hard'],
        [{ correct: true, attempts: 2 }, 'hard'],
        [{ correct: false, attempts: 2 }, 'again'],
    ];
    for (const [result, want] of grades) {
        if (gradeFor(result) !== want) fail(`rules: gradeFor(${JSON.stringify(result)}) should be ${want}`);
    }
}

const rng = mulberry32(42);
const cards = loadCards();
const byEpisode = new Map();
for (const card of cards) {
    for (const id of card.episodeIds) {
        if (!byEpisode.has(id)) byEpisode.set(id, []);
        byEpisode.get(id).push(card);
    }
}

checkRules(rng);

// With only one deck in the garden, fewer than 4 options is allowed (the
// spec's minimum is 2); count it so a regression in distractor choice shows.
let shortWithOneDeck = 0;
for (const card of cards) {
    const deck = byEpisode.get(card.episodeIds[0]);
    checkSpellingOf(card);
    checkChoices(card, cards, 'word', rng, true);
    if (checkChoices(card, deck, 'word', rng, false) < 4 && deck.length >= 4) shortWithOneDeck++;
    if (meaningOf(card)) {
        checkChoices(card, cards, 'meaning', rng, true);
        if (checkChoices(card, deck, 'meaning', rng, false) < 4 && deck.length >= 4) shortWithOneDeck++;
    }
}

console.log(`${cards.length} cards from ${byEpisode.size} episodes`);
console.log(`${shortWithOneDeck} questions have fewer than 4 options when only their own deck is in the garden`);
if (problems.length) {
    console.log(`\n${problems.length} problem(s):`);
    for (const p of problems.slice(0, 50)) console.log(`  - ${p}`);
    if (problems.length > 50) console.log(`  … and ${problems.length - 50} more`);
    process.exit(1);
}
console.log('All quiz checks passed.');
```

- [ ] **Step 2: Run it to see it fail**

Run: `node scripts/verify_quiz.js`
Expected: FAIL with `Cannot find module '.../src/lib/quiz.js'`.

- [ ] **Step 3: Write `src/lib/quiz.js`**

```js
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
 * The options for a 'meaning' or 'word' question about `card`, shuffled.
 * Distractors come from the card's own episode first, then from words of the
 * same type, then from anywhere in `pool`. An option that means the same as the
 * answer (same text, or a shared sense like "chọn" in "lựa chọn, chọn") is
 * skipped, so a sensible pick is never marked wrong.
 */
export function buildChoices(card, pool, field, rng = Math.random) {
  const valueOf = field === 'meaning' ? meaningOf : (c) => String(c.word)
  const answer = valueOf(card)
  const taken = new Set([comparable(answer)])
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
    for (const c of shuffle(tier, rng)) {
      if (wrong.length === MAX_CHOICES - 1) break
      const value = valueOf(c)
      const key = comparable(value)
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
```

- [ ] **Step 4: Run the verification**

Run: `node scripts/verify_quiz.js`
Expected: prints the card and episode counts, the "fewer than 4 options" count, then `All quiz checks passed.` and exits 0. If a problem is listed, fix `quiz.js` (not the check) unless the check contradicts the spec.

- [ ] **Step 5: Lint**

Run: `npm run lint`
Expected: no errors in `src/lib/quiz.js` or `scripts/verify_quiz.js`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/quiz.js scripts/verify_quiz.js
git commit -m "feat: question logic for the vocabulary games

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Share the session header

**Files:**
- Create: `src/components/vocab/SessionHeader.jsx`
- Modify: `src/components/vocab/StudySession.jsx` (the `remaining`/`progress` computation and the `<header>` block)
- Modify: `src/lib/speech.js` (export `canSpeak`)

- [ ] **Step 1: Create `SessionHeader.jsx`**

```jsx
import { X } from 'lucide-react'

/**
 * Exit button, progress bar and the remaining work by kind, Anki-style: blue
 * new, rose learning, green review. Shared by the flashcard and game sessions.
 */
export default function SessionHeader({ queue, cards, answers, onExit }) {
  const remaining = { new: 0, learning: 0, review: 0 }
  for (const id of new Set(queue)) {
    const c = cards[id]
    if (!c) continue
    if (c.state === 'new') remaining.new++
    else if (c.state === 'review') remaining.review++
    else remaining.learning++
  }
  const progress = answers / (answers + queue.length)

  return (
    <header className='h-16 flex items-center gap-3'>
      <button
        onClick={onExit}
        title='Thoát (Esc)'
        className='p-2 -ml-2 rounded-full text-zinc-500 hover:bg-black/5 dark:hover:bg-white/10'
      >
        <X size={22} />
      </button>
      <div className='flex-1 h-2.5 rounded-full bg-zinc-200/70 dark:bg-zinc-800 overflow-hidden'>
        <div
          className='h-full rounded-full bg-gradient-to-r from-pink-400 to-rose-500 transition-[width] duration-500'
          style={{ width: `${Math.max(4, progress * 100)}%` }}
        />
      </div>
      <div className='flex gap-2 text-sm font-bold tabular-nums'>
        <span className='text-sky-500' title='Từ mới'>{remaining.new}</span>
        <span className='text-rose-500' title='Đang học'>{remaining.learning}</span>
        <span className='text-emerald-500' title='Cần ôn'>{remaining.review}</span>
      </div>
    </header>
  )
}
```

- [ ] **Step 2: Use it in `StudySession.jsx`**

Replace the import line `import { X } from 'lucide-react'` with `import SessionHeader from './SessionHeader'` (keep the other imports).

Delete the block from `// Remaining work by kind, Anki-style: blue new, rose learning, green review.` through `const progress = stats.answers / (stats.answers + queue.length)`.

Replace the whole `<header className='h-16 flex items-center gap-3'>…</header>` element with:

```jsx
      <SessionHeader
        queue={queue}
        cards={srs.cards}
        answers={stats.answers}
        onExit={onExit}
      />
```

- [ ] **Step 3: Export `canSpeak` from `speech.js`**

Directly below the line `const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined` add:

```js

/** False where the browser has no speech synthesis at all (the games skip listening then). */
export const canSpeak = Boolean(synth)
```

- [ ] **Step 4: Lint and build**

Run: `npm run lint && source ~/.nvm/nvm.sh && nvm use 22.18.0 >/dev/null && npm run build`
Expected: lint clean; build succeeds.

- [ ] **Step 5: Check the flashcard session still works**

Run `npm run dev` (Node 22), open `http://localhost:5173/#vocab/study`, answer two cards. Expected: header, progress bar and the three counters behave exactly as before.

- [ ] **Step 6: Commit**

```bash
git add src/components/vocab/SessionHeader.jsx src/components/vocab/StudySession.jsx src/lib/speech.js
git commit -m "refactor: share the study session header; expose canSpeak

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Choice questions (Chọn nghĩa, Nghe → chọn từ)

**Files:**
- Create: `src/components/vocab/QuestionParts.jsx`
- Create: `src/components/vocab/ChoiceQuestion.jsx`

- [ ] **Step 1: Create `QuestionParts.jsx`**

```jsx
import { ArrowRight, Check, X } from 'lucide-react'
import classNames from 'classnames'

/** The white card a game question sits on, with its instruction on top. */
export function QuestionCard({ label, children }) {
  return (
    <div className='rounded-[2rem] bg-white dark:bg-zinc-900 border border-black/[0.04] dark:border-white/10 shadow-2xl shadow-rose-900/10 dark:shadow-black/40 p-6 text-center'>
      <p className='text-xs font-semibold uppercase tracking-wider text-zinc-400'>{label}</p>
      {children}
    </div>
  )
}

/** Shown once a question is answered: how it went, and the way on. */
export function ContinueButton({ correct, onClick }) {
  return (
    <div className='flex items-center gap-3 vocab-rise-in'>
      <p
        className={classNames(
          'flex-1 flex items-center gap-2 font-bold',
          correct ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400',
        )}
      >
        {correct ? <Check size={20} /> : <X size={20} />}
        {correct ? 'Chính xác!' : 'Chưa đúng'}
      </p>
      <button
        onClick={onClick}
        className='flex items-center gap-2 px-6 py-3.5 rounded-2xl bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 font-bold shadow-lg active:scale-[0.98] transition'
      >
        Tiếp <ArrowRight size={18} />
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Create `ChoiceQuestion.jsx`**

```jsx
import { useEffect, useRef, useState } from 'react'
import { Volume2 } from 'lucide-react'
import classNames from 'classnames'
import { meaningOf } from '../../lib/quiz'
import { speak } from '../../lib/speech'
import { ContinueButton, QuestionCard } from './QuestionParts'

const OPTION_STYLES = {
  idle: 'bg-white border-zinc-200 hover:border-rose-300 hover:bg-rose-50 dark:bg-zinc-900 dark:border-zinc-700 dark:hover:bg-rose-500/10',
  right: 'bg-emerald-50 border-emerald-400 text-emerald-700 dark:bg-emerald-500/10 dark:border-emerald-500/50 dark:text-emerald-300',
  wrong: 'bg-rose-50 border-rose-400 text-rose-700 dark:bg-rose-500/10 dark:border-rose-500/50 dark:text-rose-300',
  dim: 'bg-white border-zinc-200 opacity-50 dark:bg-zinc-900 dark:border-zinc-700',
}

/**
 * Chọn nghĩa (`kind` 'meaning': the word is shown, pick its meaning) and
 * Nghe (`kind` 'listen': the word is spoken, pick how it is written).
 * `onDone({ correct })` is called when the learner moves on rather than when
 * they pick, so the right answer stays on screen until then.
 */
export default function ChoiceQuestion({ card, kind, options, answerIndex, autoSpeak, onDone }) {
  const [picked, setPicked] = useState(null)
  const done = useRef(false)
  const listen = kind === 'listen'
  const answered = picked !== null
  const correct = picked === answerIndex

  useEffect(() => {
    if (listen || autoSpeak) speak(card.word)
  }, [card.word, listen, autoSpeak])

  const pick = (i) => {
    if (!answered) setPicked(i)
  }

  const next = () => {
    if (!answered || done.current) return
    done.current = true
    onDone({ correct })
  }

  useEffect(() => {
    const onKey = (e) => {
      if (e.target instanceof HTMLInputElement) return
      if (!answered) {
        const i = Number(e.key) - 1
        if (i >= 0 && i < options.length) pick(i)
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        next()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const say = () => speak(card.word)
  const meaning = meaningOf(card)

  return (
    <div className='w-full max-w-md mx-auto flex flex-col gap-5 vocab-pop-in'>
      <QuestionCard label={listen ? 'Nghe và chọn từ đúng' : 'Chọn nghĩa đúng'}>
        {listen && !answered ? (
          <button
            onClick={say}
            title='Nghe lại'
            aria-label='Nghe lại'
            className='mt-5 mb-2 mx-auto w-20 h-20 rounded-full bg-rose-500 text-white flex items-center justify-center shadow-lg shadow-rose-500/30 active:scale-95 transition'
          >
            <Volume2 size={36} />
          </button>
        ) : (
          <div className='mt-3 flex flex-col items-center gap-1'>
            <h2 className='text-4xl font-bold tracking-tight break-words text-emerald-600 dark:text-emerald-400'>
              {card.word}
            </h2>
            {card.ipa && <p className='text-zinc-400 dark:text-zinc-500'>/{card.ipa}/</p>}
            <button
              onClick={say}
              title='Nghe phát âm'
              aria-label='Nghe phát âm'
              className='mt-1 p-2 rounded-full text-zinc-500 hover:bg-black/5 dark:text-zinc-400 dark:hover:bg-white/10'
            >
              <Volume2 size={20} />
            </button>
            {listen && meaning && (
              <p className='vi-text text-xl font-bold text-indigo-600 dark:text-indigo-400'>{meaning}</p>
            )}
          </div>
        )}
      </QuestionCard>

      <ul className='grid gap-2.5'>
        {options.map((option, i) => {
          const state = !answered
            ? 'idle'
            : i === answerIndex
              ? 'right'
              : i === picked
                ? 'wrong'
                : 'dim'
          return (
            <li key={option}>
              <button
                disabled={answered}
                onClick={() => pick(i)}
                className={classNames(
                  'w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl border text-left font-semibold transition active:scale-[0.99]',
                  OPTION_STYLES[state],
                  !listen && 'vi-text',
                )}
              >
                <span className='w-7 h-7 flex-none rounded-full bg-black/5 dark:bg-white/10 text-xs flex items-center justify-center tabular-nums'>
                  {i + 1}
                </span>
                <span className='flex-1 break-words'>{option}</span>
              </button>
            </li>
          )
        })}
      </ul>

      {answered && <ContinueButton correct={correct} onClick={next} />}
    </div>
  )
}
```

(Options are unique after `comparable`, so `key={option}` is stable.)

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: clean. (The component is not mounted yet; it is exercised in Task 5.)

- [ ] **Step 4: Commit**

```bash
git add src/components/vocab/QuestionParts.jsx src/components/vocab/ChoiceQuestion.jsx
git commit -m "feat: multiple-choice questions for the vocabulary games

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Spelling question (Điền từ)

**Files:**
- Create: `src/components/vocab/SpellQuestion.jsx`
- Modify: `src/index.css` (add `vocab-shake` next to the other `vocab-*` animations)

- [ ] **Step 1: Add the shake animation to `src/index.css`**

After the line `.vocab-rise-in { animation: vocab-rise-in 220ms ease-out; }` add:

```css
@keyframes vocab-shake {
  0%, 100% { transform: none; }
  20%, 60% { transform: translateX(-6px); }
  40%, 80% { transform: translateX(6px); }
}
.vocab-shake { animation: vocab-shake 320ms ease-in-out; }
```

And change the reduced-motion rule to:

```css
  .vocab-fade-in, .vocab-pop-in, .vocab-rise-in, .vocab-shake { animation: none; }
```

- [ ] **Step 2: Create `SpellQuestion.jsx`**

```jsx
import { useEffect, useRef, useState } from 'react'
import { Lightbulb, Volume2 } from 'lucide-react'
import classNames from 'classnames'
import { checkSpelling, lettersOf, maskWord, meaningOf } from '../../lib/quiz'
import { speak } from '../../lib/speech'
import { ContinueButton, QuestionCard } from './QuestionParts'

// A wrong check is allowed once; the second one shows the answer.
const MAX_ATTEMPTS = 2

/**
 * Điền từ: the meaning is shown and the word is typed into letter cells.
 * A hidden <input> takes the keyboard so phones open theirs; the cells only
 * draw what it holds. `onDone({ correct, hinted, attempts })` is called when
 * the learner moves on.
 */
export default function SpellQuestion({ card, onDone }) {
  const words = maskWord(card.word)
  const answer = lettersOf(card.word)
  const [typed, setTyped] = useState('')
  // Letters given away by Gợi ý, always a prefix of the answer. They survive a
  // wrong check, and mark the answer as hinted.
  const [hinted, setHinted] = useState(0)
  const [attempts, setAttempts] = useState(0)
  const [result, setResult] = useState(null) // null | 'right' | 'wrong'
  const [shakes, setShakes] = useState(0)
  const input = useRef(null)
  const done = useRef(false)

  useEffect(() => {
    input.current?.focus()
  }, [])

  const focus = () => input.current?.focus()

  const onChange = (e) => {
    if (result) return
    const next = lettersOf(e.target.value).slice(0, answer.length)
    const given = answer.slice(0, hinted)
    setTyped(next.length < hinted ? given : given + next.slice(hinted))
  }

  const hint = () => {
    if (result) return
    let i = 0
    while (i < typed.length && typed[i] === answer[i]) i++
    const n = Math.min(answer.length, i + 1)
    setHinted(n)
    setTyped(answer.slice(0, n))
    focus()
  }

  const finish = (outcome) => {
    setResult(outcome)
    speak(card.word)
  }

  const check = () => {
    if (result || typed.length < answer.length) return
    const n = attempts + 1
    setAttempts(n)
    if (checkSpelling(typed, card.word)) return finish('right')
    if (n >= MAX_ATTEMPTS) return finish('wrong')
    setShakes((s) => s + 1)
    setTyped(answer.slice(0, hinted))
    focus()
  }

  const giveUp = () => {
    if (!result) finish('wrong')
  }

  const next = () => {
    if (!result || done.current) return
    done.current = true
    onDone({ correct: result === 'right', hinted: hinted > 0, attempts: Math.max(1, attempts) })
  }

  const onKeyDown = (e) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    if (result) next()
    else check()
  }

  return (
    <div className='w-full max-w-md mx-auto flex flex-col gap-5 vocab-pop-in'>
      <QuestionCard label='Viết từ tiếng Anh'>
        <p className='vi-text mt-3 text-2xl font-bold text-indigo-600 dark:text-indigo-400'>
          {meaningOf(card)}
        </p>
        {card.vi && card.def && (
          <p className='mt-1 text-sm text-zinc-500 dark:text-zinc-400'>{card.def}</p>
        )}

        <div
          key={shakes}
          onClick={focus}
          className={classNames(
            'relative mt-6 flex flex-wrap justify-center gap-x-4 gap-y-3 cursor-text',
            shakes > 0 && 'vocab-shake',
          )}
        >
          {words.map((tokens, w) => (
            <span key={w} className='inline-flex items-end gap-1'>
              {tokens.map((t, i) =>
                t.type === 'mark' ? (
                  <span key={i} className='pb-1 text-2xl font-bold text-zinc-400'>
                    {t.char}
                  </span>
                ) : (
                  <Cell
                    key={i}
                    char={result === 'wrong' ? t.char : typed[t.index] ?? ''}
                    state={
                      result === 'right'
                        ? 'right'
                        : result === 'wrong'
                          ? 'wrong'
                          : t.index < hinted
                            ? 'hinted'
                            : t.index === typed.length
                              ? 'active'
                              : 'idle'
                    }
                  />
                ),
              )}
            </span>
          ))}
          <input
            ref={input}
            value={typed}
            onChange={onChange}
            onKeyDown={onKeyDown}
            aria-label='Gõ từ tiếng Anh'
            autoCapitalize='none'
            autoCorrect='off'
            autoComplete='off'
            spellCheck={false}
            enterKeyHint='done'
            className='absolute inset-0 w-full h-full opacity-0 cursor-text'
          />
        </div>

        {result && (
          <div className='mt-5 flex items-center justify-center gap-2 vocab-rise-in'>
            <span className='text-lg font-bold text-emerald-600 dark:text-emerald-400'>{card.word}</span>
            {card.ipa && <span className='text-zinc-400 dark:text-zinc-500'>/{card.ipa}/</span>}
            <button
              onClick={() => speak(card.word)}
              title='Nghe phát âm'
              aria-label='Nghe phát âm'
              className='p-1.5 rounded-full text-zinc-500 hover:bg-black/5 dark:text-zinc-400 dark:hover:bg-white/10'
            >
              <Volume2 size={18} />
            </button>
          </div>
        )}
      </QuestionCard>

      {result ? (
        <ContinueButton correct={result === 'right'} onClick={next} />
      ) : (
        <div className='flex gap-2'>
          <button
            onClick={hint}
            className='flex items-center gap-1.5 px-4 py-3.5 rounded-2xl border border-amber-200 bg-amber-50 text-amber-700 font-semibold dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/30 active:scale-[0.98] transition'
          >
            <Lightbulb size={18} /> Gợi ý
          </button>
          <button
            onClick={giveUp}
            className='px-4 py-3.5 rounded-2xl border border-zinc-200 text-zinc-600 font-semibold dark:border-zinc-700 dark:text-zinc-300 active:scale-[0.98] transition'
          >
            Bỏ qua
          </button>
          <button
            onClick={check}
            disabled={typed.length < answer.length}
            className='flex-1 py-3.5 rounded-2xl bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 font-bold shadow-lg active:scale-[0.98] transition disabled:opacity-40'
          >
            Kiểm tra
          </button>
        </div>
      )}
      {!result && attempts === 1 && (
        <p className='-mt-2 text-center text-sm font-medium text-rose-600 dark:text-rose-400'>
          Chưa đúng, thử lại một lần nữa nhé.
        </p>
      )}
    </div>
  )
}

const CELL_STYLES = {
  idle: 'border-zinc-300 dark:border-zinc-600',
  active: 'border-rose-500',
  hinted: 'border-amber-400 text-amber-600 dark:text-amber-300',
  right: 'border-emerald-500 text-emerald-600 dark:text-emerald-400',
  wrong: 'border-rose-400 text-rose-600 dark:text-rose-400',
}

function Cell({ char, state }) {
  return (
    <span
      className={classNames(
        'w-7 h-10 sm:w-8 sm:h-11 flex items-end justify-center pb-0.5 border-b-4 text-2xl font-bold transition-colors',
        CELL_STYLES[state],
      )}
    >
      {char}
    </span>
  )
}
```

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/components/vocab/SpellQuestion.jsx src/index.css
git commit -m "feat: spelling question for the vocabulary games

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Game session and route

**Files:**
- Create: `src/components/vocab/GameSession.jsx`
- Modify: `src/components/vocab/VocabApp.jsx` (imports, route comment, `page === 'study'` branch)

- [ ] **Step 1: Create `GameSession.jsx`**

```jsx
import { useEffect, useState } from 'react'
import { schedule } from '../../lib/srs'
import { buildQueue, getSrsState, rateCard, useSrs } from '../../lib/srsStore'
import { gradeFor, makeQuestion } from '../../lib/quiz'
import { canSpeak } from '../../lib/speech'
import ChoiceQuestion from './ChoiceQuestion'
import SessionHeader from './SessionHeader'
import SessionSummary from './SessionSummary'
import SpellQuestion from './SpellQuestion'

// As in StudySession: a card still learning comes back after a few others.
const REQUEUE_GAP = 3

/**
 * The head of `queue` with its question. Cards nothing can be asked about (see
 * quiz.makeQuestion) are dropped from this game; flashcards still cover them.
 */
function nextRound(srs, queue, recent) {
  const pool = Object.values(srs.cards)
  let rest = queue
  while (rest.length) {
    const card = srs.cards[rest[0]]
    const question = card ? makeQuestion(card, pool, recent, { canSpeak }) : null
    if (question) return { queue: rest, question, recent }
    rest = rest.slice(1)
  }
  return { queue: rest, question: null, recent }
}

export default function GameSession({ episodeId, episode, onExit }) {
  const srs = useSrs()
  const [round, setRound] = useState(() =>
    nextRound(srs, buildQueue(srs, Date.now(), episodeId), []),
  )
  // Bumped on every answer: it keys the question so the same card twice in a
  // row still remounts fresh.
  const [turn, setTurn] = useState(0)
  const [stats, setStats] = useState(() => ({
    startedAt: Date.now(),
    answers: 0,
    forgotten: 0,
    learned: 0,
  }))

  const { queue, question, recent } = round
  const card = question ? srs.cards[queue[0]] : null

  const answer = (result) => {
    if (!card) return
    const rating = gradeFor(result)
    const answeredAt = Date.now()
    const next = schedule(card, rating, answeredAt)
    rateCard(card.id, rating, answeredAt)

    const rest = queue.slice(1)
    if (next.state !== 'review') {
      rest.splice(Math.min(rest.length, REQUEUE_GAP), 0, card.id)
    }
    // Read the store again: `srs` from this render predates the rating above.
    setRound(nextRound(getSrsState(), rest, [...recent, question.kind].slice(-2)))
    setStats((s) => ({
      ...s,
      answers: s.answers + 1,
      forgotten: s.forgotten + (rating === 'again' ? 1 : 0),
      learned: s.learned + (card.state === 'new' ? 1 : 0),
    }))
    setTurn((t) => t + 1)
  }

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onExit()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onExit])

  if (!card) {
    return <SessionSummary stats={stats} onExit={onExit} />
  }

  return (
    <div className='min-h-full flex flex-col max-w-xl mx-auto px-4'>
      <SessionHeader queue={queue} cards={srs.cards} answers={stats.answers} onExit={onExit} />

      {episode && (
        <p className='text-center text-xs font-medium text-zinc-500 dark:text-zinc-400'>
          Bài {episode.id} · {episode.title}
        </p>
      )}

      <div className='flex-1 flex flex-col justify-center py-6'>
        {question.kind === 'spell' ? (
          <SpellQuestion key={turn} card={card} onDone={answer} />
        ) : (
          <ChoiceQuestion
            key={turn}
            card={card}
            kind={question.kind}
            options={question.options}
            answerIndex={question.answerIndex}
            autoSpeak={srs.settings.autoSpeak}
            onDone={answer}
          />
        )}
      </div>

      <p className='pb-8 text-center text-xs text-zinc-400 hidden sm:block'>
        {question.kind === 'spell'
          ? 'Enter để kiểm tra · Esc để thoát'
          : 'Phím 1–4 để chọn · Enter để tiếp · Esc để thoát'}
      </p>
    </div>
  )
}
```

- [ ] **Step 2: Add the route in `VocabApp.jsx`**

Add the import below `import StudySession from './StudySession'`:

```jsx
import GameSession from './GameSession'
```

Change the route comment to:

```jsx
// Full-screen vocabulary area, laid over the podcast view so audio keeps
// playing underneath. Sub-pages live in the hash (#vocab, #vocab/decks,
// #vocab/words/<filter>, #vocab/episode/<id>, #vocab/study, #vocab/study/<episodeId>,
// #vocab/play, #vocab/play/<episodeId>) so the browser back button works.
```

Replace the `if (page === 'study') { … }` block with:

```jsx
  if (page === 'study' || page === 'play') {
    const episodeId = param ? Number(param) : null
    const Session = page === 'play' ? GameSession : StudySession
    return (
      <Shell>
        <Session
          // A new scope is a new session: remount rather than patch state.
          key={route}
          episodeId={episodeId}
          episode={episodes.find((e) => e.id === episodeId)}
          onExit={() => navigate('vocab')}
        />
      </Shell>
    )
  }
```

- [ ] **Step 3: Lint and build**

Run: `npm run lint && source ~/.nvm/nvm.sh && nvm use 22.18.0 >/dev/null && npm run build`
Expected: lint clean; build succeeds.

- [ ] **Step 4: Drive it in the app**

Run `npm run dev` (Node 22). With at least one deck in the garden (add one at `#vocab/decks` if needed), open `http://localhost:5173/#vocab/play`. Check:
- New cards only show "Chọn nghĩa đúng" or "Nghe và chọn từ đúng"; a listen question speaks the word on appear and the big button replays it.
- Picking colours the right option green and a wrong pick red; keys 1–4 pick, Enter continues.
- After a card has been answered once and comes back (requeue), "Viết từ tiếng Anh" can appear: typing fills cells, `'`/`-` are pre-shown, Gợi ý fills the next letter in amber, a first wrong check shakes and clears the non-hinted letters, a second shows the answer, Bỏ qua shows the answer.
- A phrase (e.g. "go with") wraps between words, never inside one; try a narrow window (~375px).
- Esc exits; the summary appears when the queue is empty.
- Back at `#vocab`, the due/new counts have changed by what was answered.
- `http://localhost:5173/#vocab/play/<an episode id in the garden>` shows only that episode's words and its caption.

- [ ] **Step 5: Commit**

```bash
git add src/components/vocab/GameSession.jsx src/components/vocab/VocabApp.jsx
git commit -m "feat: vocabulary game session scheduled like the flashcards

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: "Chơi" buttons on the garden home

**Files:**
- Modify: `src/components/vocab/VocabHome.jsx` (imports, `VocabHome` body, `TodayCard`, `DeckRow`)

- [ ] **Step 1: Imports**

Add `Gamepad2` to the lucide import:

```jsx
import { ChevronRight, Flame, Gamepad2, Headphones, List, Play, Plus, Trash2, Volume2, VolumeX } from 'lucide-react'
```

Add below the `srsStore` import:

```jsx
import { MIN_POOL } from '../../lib/quiz'
```

Add below `import { STAGES } from './stages'`:

```jsx

const PLAY_NEEDS = `Cần ít nhất ${MIN_POOL} từ trong vườn để chơi`
```

- [ ] **Step 2: Compute `canPlay` in `VocabHome` and pass it down**

After `const goal = doneToday + overall.due + overall.seed` add:

```jsx
  // The games draw wrong answers from the whole garden, so they need a few words.
  const canPlay = Object.keys(srs.cards).length >= MIN_POOL
```

Pass `canPlay={canPlay}` to `<TodayCard … />` and to each `<DeckRow … />`.

- [ ] **Step 3: Add the button to `TodayCard`**

Change the signature to `function TodayCard({ streak, doneToday, goal, due, fresh, ahead, nextDue, canPlay })`.

Replace the single `<button disabled={!canStudy} onClick={() => navigate('vocab/study')} …>…</button>` with:

```jsx
      <div className='relative mt-6 flex gap-2'>
        <button
          disabled={!canStudy}
          onClick={() => navigate('vocab/study')}
          className='flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-white text-rose-600 font-bold text-base shadow-lg shadow-rose-900/10 hover:scale-[1.01] active:scale-[0.99] transition-transform disabled:opacity-60 disabled:hover:scale-100 dark:bg-zinc-950 dark:text-rose-300'
        >
          <Play size={18} fill='currentColor' />
          {hasWork ? 'Bắt đầu học' : 'Ôn thêm'}
        </button>
        <button
          disabled={!canStudy || !canPlay}
          title={canPlay ? 'Ôn bằng trò chơi' : PLAY_NEEDS}
          onClick={() => navigate('vocab/play')}
          className='flex items-center justify-center gap-2 px-5 py-3.5 rounded-2xl bg-white/20 border border-white/40 text-white font-bold text-base hover:bg-white/30 active:scale-[0.99] transition disabled:opacity-60'
        >
          <Gamepad2 size={18} />
          Chơi
        </button>
      </div>
```

- [ ] **Step 4: Add the button to `DeckRow`**

Change the signature to `function DeckRow({ episode, counts, onOpenEpisode, canPlay })`.

Insert directly before the existing study button (the one with `title={toStudy ? 'Học bài này' : 'Ôn thêm bài này'}`):

```jsx
            <button
              disabled={counts.total === 0 || !canPlay}
              title={canPlay ? 'Chơi với bộ từ này' : PLAY_NEEDS}
              onClick={() => navigate(`vocab/play/${episode.id}`)}
              className='p-2 rounded-full text-zinc-500 hover:text-rose-500 hover:bg-rose-50 dark:text-zinc-400 dark:hover:bg-rose-500/10 disabled:opacity-40 disabled:hover:bg-transparent'
            >
              <Gamepad2 size={18} />
            </button>
```

- [ ] **Step 5: Lint and build**

Run: `npm run lint && source ~/.nvm/nvm.sh && nvm use 22.18.0 >/dev/null && npm run build`
Expected: lint clean; build succeeds.

- [ ] **Step 6: Drive it in the app**

With `npm run dev` (Node 22) open `http://localhost:5173/#vocab`. Check:
- The today card shows "Bắt đầu học" and "Chơi" side by side, both fitting at ~375px wide, in light and dark theme.
- "Chơi" opens `#vocab/play`; each deck row's gamepad icon opens `#vocab/play/<id>`.
- The browser back button returns to `#vocab`.

- [ ] **Step 7: Commit**

```bash
git add src/components/vocab/VocabHome.jsx
git commit -m "feat: add Chơi buttons to the vocabulary garden

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Final verification

- [ ] **Step 1:** Run `node scripts/verify_quiz.js`. Expected: `All quiz checks passed.`
- [ ] **Step 2:** Run `npm run lint`. Expected: clean.
- [ ] **Step 3:** Run `source ~/.nvm/nvm.sh && nvm use 22.18.0 >/dev/null && npm run build`. Expected: succeeds.
- [ ] **Step 4:** In the app, play one full round at `#vocab/play` that covers all three kinds, a hinted spelling, a wrong spelling and a wrong pick; confirm the summary shows the right answer/forgotten counts and that flashcards at `#vocab/study` still work.

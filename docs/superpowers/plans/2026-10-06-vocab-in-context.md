# Học từ trong ngữ cảnh (đợt A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every vocabulary word gets an example sentence (from the dialogue, or written), two new sentence-based game kinds (cloze, dictation), question kinds chosen by the card's garden stage, a daily cap on new words, and a "Hay quên" (leech) marker.

**Architecture:** Example sentences are authored data (`scripts/data/vocab-ex/*.jsonl`) merged by `build_vocab.js` into the per-episode vocab JSON the app already serves; the app fetches those files on demand (`src/lib/examples.ts`) so cards, localStorage and sync stay untouched. Pure logic (`quiz.ts`, `srs.ts`, `srsStore.ts` selectors) is checked by Node scripts; the only server change is one synced setting (`newPerDay`).

**Tech Stack:** React 19 + TypeScript + Vite + Tailwind 4 (React Compiler on), Node scripts (ESM, `.ts` imports via Node 22 type stripping), Express + Prisma 7 + Postgres server, zod.

**Spec:** [docs/superpowers/specs/2026-10-06-vocab-in-context-design.md](../specs/2026-10-06-vocab-in-context-design.md)

**Conventions for every task:**
- Node: the default Node here is 20.9 and cannot run these scripts. Prefix every `node`/`npm` command with
  `source ~/.nvm/nvm.sh && nvm use 22.18.0 >/dev/null && `.
- No test framework (by the user's choice). "Tests" are checks in `scripts/verify_*.js` that exit non-zero on failure, plus `npm run typecheck`, `npm run lint`, `npm run format:check`.
- `scripts/` style: 4-space indent, single quotes, semicolons. `src/` style: 2 spaces, single quotes (also in JSX), no semicolons (Prettier). Run `npm run format` after editing `src/`.
- Commit messages: conventional (`feat:`, `fix:`, `docs:`, `chore:`), ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

**Deviations from the spec (decided while planning, spec updated in Task 0):**
1. `vocab-ex` files are grouped by episode range (20 episodes per file → 19 files, `exFileFor(ep)`), not by the vocab-vi batches, and each row carries `ep`.
2. Cloze reuses `SpellQuestion` (new optional props) instead of extracting a `LetterCells` component.
3. Dictation always reads the sentence on show (it is a listening task, like `listen`), regardless of `autoSpeak`.
4. `loadExamples`/`useExamples` take episode ids only (every `transcript_id` is `englishpod_NNNN`).

---

## File map

| File | Responsibility |
| --- | --- |
| `scripts/lib/transcripts.js` (new) | Read transcript HTML: vocab items (moved from build_vocab.js), dialogue lines. |
| `scripts/lib/examples.js` (new) | vocab-ex file layout, row reading, corpus pairs, sentence split, `findHit`. |
| `scripts/extract_examples.js` (new) | Draft vocab-ex rows from the dialogue; never overwrites authored rows. |
| `scripts/verify_examples.js` (new) | Validate vocab-ex rows; `--file=`, `--summary`. |
| `scripts/data/vocab-ex/*.jsonl` (new) | Authored example data. |
| `scripts/build_vocab.js` | Use `lib/transcripts.js`; merge `ex`, `exHit`, `exVi`. |
| `scripts/verify_quiz.js` | Checks for stage kinds, cloze, dictation grading. |
| `src/types.ts` | `VocabEntry.ex/exHit/exVi`. |
| `src/lib/speech.ts` | `speak(text, { rate })`. |
| `src/lib/srs.ts` | `isLeech`, `LEECH_LAPSES`; `stageOf` takes only what it reads. |
| `src/lib/quiz.ts` | `cloze`/`dictation` kinds, stage-based `allowedKinds`, `gradeDictation`. |
| `src/lib/examples.ts` (new) | Fetch/cache examples per episode; `exampleOf`, `useExamples`, `episodeIdsOf`. |
| `src/lib/srsStore.ts` | `Settings.newPerDay`, `newCardsLeft`, capped `buildQueue`, `summarize.freshToday`, sync merge. |
| `src/components/TappableText.tsx` | Optional `highlight`. |
| `src/components/vocab/ExampleSentence.tsx` (new) | Sentence + speak + Vietnamese. |
| `src/components/vocab/LeechBadge.tsx` (new) | "Hay quên" pill. |
| `src/components/vocab/Flashcard.tsx`, `StudySession.tsx` | Example on the back, leech badge, load examples. |
| `src/components/vocab/SpellQuestion.tsx` | Optional `target`, `label`, `prompt`, `spoken`, `example`. |
| `src/components/vocab/ClozeQuestion.tsx` (new) | Cloze on top of SpellQuestion. |
| `src/components/vocab/DictationQuestion.tsx` (new) | Dictation. |
| `src/components/vocab/ChoiceQuestion.tsx` | Optional `example` shown after answering. |
| `src/components/vocab/GameSession.tsx` | Load examples, new kinds. |
| `src/components/vocab/VocabHome.tsx` | New-per-day setting, today card uses `freshToday`. |
| `src/components/vocab/WordList.tsx` | Leech filter and badge. |
| `server/prisma/schema.prisma` + migration, `server/src/sync/{schema,wire,service}.ts`, `server/scripts/smoke.ts` | `newPerDay`. |

---

### Task 0: Align the spec with the plan's deviations

**Files:** Modify `docs/superpowers/specs/2026-10-06-vocab-in-context-design.md`

- [ ] **Step 1: Edit the spec**

In "Nguồn soạn tay", replace the sentence `Cùng cách chia file như \`scripts/data/vocab-vi/\` (mỗi file 1 dải bài). Mỗi dòng:` with:

```markdown
Mỗi file gom 20 bài theo `ep` (`0001.jsonl` = bài 1–20, …, `0019.jsonl` = bài 361–365). Mỗi dòng:
```

and add `"ep":1,` after `"src":"dialogue",` in the JSON example, plus this table row after `src`:

```markdown
| `ep` | Bài chứa câu (với `dialogue`) hoặc bài đầu tiên có cặp từ này (với `written`); quyết định file. |
```

In section 2, replace the code block with:

```ts
export interface Example { ex: string; hit: string; vi: string }
export function loadExamples(episodeIds: number[]): Promise<void>
export function exampleOf(card: Pick<Card, 'id' | 'episodeIds'>): Example | null
/** true khi file của mọi bài trong episodeIds đã tải xong (hoặc lỗi). */
export function useExamples(episodeIds: number[]): boolean
export function episodeIdsOf(cards: (Pick<Card, 'episodeIds'> | undefined)[]): number[]
```

In "Cloze", replace `(dùng \`maskWord(hit)\` và phần ô chữ tách ra từ \`SpellQuestion\` thành component chung \`LetterCells\`)` with `(dùng lại \`SpellQuestion\` với các prop tuỳ chọn \`target\`, \`label\`, \`prompt\`, \`spoken\`, \`example\`)`.

In "Chép chính tả", replace `Tự đọc câu khi hiện (theo \`autoSpeak\`)` with `Luôn tự đọc câu khi hiện (đây là câu nghe, giống \`listen\`)`.

In "Cấu trúc code", replace the `LetterCells.tsx` row with:

```markdown
| `src/components/vocab/SpellQuestion.tsx` | Thêm prop tuỳ chọn để Cloze dùng lại. |
| `src/components/vocab/ExampleSentence.tsx`, `LeechBadge.tsx` | Mới. |
| `scripts/lib/transcripts.js`, `scripts/lib/examples.js` | Mới: đọc transcript, dữ liệu ví dụ (dùng chung cho các script). |
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/specs/2026-10-06-vocab-in-context-design.md
git commit -m "docs: align vocab-in-context spec with the implementation plan

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 1: Share transcript reading between scripts

**Files:**
- Create: `scripts/lib/transcripts.js`
- Modify: `scripts/build_vocab.js` (remove `VOCAB_ITEM`, `decodeEntities`, `wordRecovery`/`loadWordRecovery`, `readEpisodeItems`, `TRANSCRIPT_DIR`; import instead)

- [ ] **Step 1: Record the baseline**

Run: `node scripts/build_vocab.js && git status --short public/vocab`
Expected: the build prints `Episode files written: 361, ...` and `git status` shows **no** changes under `public/vocab` (the committed files are reproducible). If there are changes, stop and report: the refactor below must be checked against a clean baseline.

- [ ] **Step 2: Create `scripts/lib/transcripts.js`**

```js
/**
 * Reading the archived transcript HTML in public/transcripts/: the vocabulary
 * items and the dialogue lines. Shared by build_vocab.js and the example
 * sentence scripts so they agree on what an episode contains.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { normalizeText } from '../../src/lib/vocabulary.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const ROOT = path.resolve(__dirname, '../..');
export const TRANSCRIPT_DIR = path.join(ROOT, 'public/transcripts');
export const LAST_EPISODE = 365;

const VOCAB_ITEM =
    /<div class="word">([\s\S]*?)<\/div>\s*<div class="type">([\s\S]*?)<\/div>\s*<div class="definition">([\s\S]*?)<\/div>/g;

// Only dialogue lines use class="text"; the vocabulary blocks use word/type/definition.
const DIALOGUE_LINE = /<div class="text">([\s\S]*?)<\/div>/g;

export const decodeEntities = (s) =>
    s
        .replace(/&nbsp;/g, ' ')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&');

let wordRecovery = null;
/**
 * 19 vocab items across the corpus have a definition but an empty
 * <div class="word"> in the archive.org HTML, so re-fetching cannot help. The
 * words in this file were reconstructed from the episode's own dialogue and
 * from definitions that happen to carry the word after a "/" — see the "why"
 * field on each entry.
 */
function loadWordRecovery() {
    if (wordRecovery) return wordRecovery;
    wordRecovery = new Map();
    const file = path.join(ROOT, 'scripts/data/vocab-word-recovery.json');
    if (fs.existsSync(file)) {
        for (const [k, v] of Object.entries(JSON.parse(fs.readFileSync(file, 'utf-8')))) {
            if (k.startsWith('_')) continue;
            wordRecovery.set(k, normalizeText(v.word));
        }
    }
    return wordRecovery;
}

function readTranscript(episodeId) {
    const file = path.join(TRANSCRIPT_DIR, `englishpod_${String(episodeId).padStart(4, '0')}.html`);
    return fs.existsSync(file) ? fs.readFileSync(file, 'utf-8') : null;
}

/** The episode's vocabulary items, or null when there is no transcript. */
export function readEpisodeItems(episodeId) {
    const html = readTranscript(episodeId);
    if (html === null) return null;

    const recovery = loadWordRecovery();
    const items = [];
    let index = 0;
    for (const m of html.matchAll(VOCAB_ITEM)) {
        const type = normalizeText(decodeEntities(m[2]));
        const definition = normalizeText(decodeEntities(m[3]));
        // Keep counting even when an item is dropped: the index has to stay in
        // step with the .vocab-item elements the runtime walks.
        const domIndex = index++;
        const word =
            normalizeText(decodeEntities(m[1])) || recovery.get(`${episodeId}#${domIndex}`) || '';
        if (!word) continue;
        items.push({ word, type, definition, domIndex });
    }
    return items;
}

/** The dialogue's lines as plain text; empty when there is no transcript. */
export function readDialogueLines(episodeId) {
    const html = readTranscript(episodeId);
    if (html === null) return [];
    return [...html.matchAll(DIALOGUE_LINE)]
        .map((m) => normalizeText(decodeEntities(m[1].replace(/<[^>]+>/g, ''))))
        .filter(Boolean);
}
```

- [ ] **Step 3: Point `build_vocab.js` at it**

In `scripts/build_vocab.js`:
- Delete the whole `// ---- transcripts` section: `VOCAB_ITEM`, `decodeEntities`, `let wordRecovery`, its doc comment, `loadWordRecovery()` and `readEpisodeItems()`.
- Delete the line `const TRANSCRIPT_DIR = path.join(ROOT, 'public/transcripts');`.
- Change the import block to:

```js
import fs from 'fs';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';
import { normalizeText, vocabKey } from '../src/lib/vocabulary.ts';
import { readEpisodeItems } from './lib/transcripts.js';
```

(`ROOT`, `OUT_DIR`, `VI_DIR`, `CACHE_DIR`, … stay as they are in build_vocab.js.)
- Change the last line to `export { loadCmudict, ipaFor, loadTranslations };` — `readEpisodeItems` now lives in `lib/transcripts.js`.

In `scripts/verify_vocab.js`, change `import { readEpisodeItems } from './build_vocab.js';` to `import { readEpisodeItems } from './lib/transcripts.js';` (check `grep -n "build_vocab" scripts/*.js` — if verify_vocab imports anything else from build_vocab.js, keep that in a separate import).

- [ ] **Step 4: Verify the output did not change**

Run: `node scripts/build_vocab.js && git status --short public/vocab && node scripts/verify_vocab.js && npm run lint`
Expected: same summary as Step 1, no changes under `public/vocab`, verify_vocab passes as before, lint clean.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/transcripts.js scripts/build_vocab.js scripts/verify_vocab.js
git commit -m "chore: share transcript reading between vocab scripts

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Example data helpers and the draft extractor

**Files:**
- Create: `scripts/lib/examples.js`
- Create: `scripts/extract_examples.js`
- Create (generated): `scripts/data/vocab-ex/0001.jsonl` … `0019.jsonl`

- [ ] **Step 1: Create `scripts/lib/examples.js`**

```js
/**
 * The example-sentence data in scripts/data/vocab-ex/*.jsonl (see
 * docs/superpowers/specs/2026-10-06-vocab-in-context-design.md).
 *
 * One row per (word, definition) pair — keyed like vocab-vi, since the same
 * word can carry different senses — filed by `ep`, the episode the sentence
 * comes from (or the pair's first episode for a written sentence):
 *
 *   {"w","d","ex","hit","src":"dialogue"|"written","ep","vi"[,"check":true]}
 */

import fs from 'fs';
import path from 'path';
import { vocabKey } from '../../src/lib/vocabulary.ts';
import { LAST_EPISODE, ROOT, readEpisodeItems } from './transcripts.js';

export const EX_DIR = path.join(ROOT, 'scripts/data/vocab-ex');
export const EPISODES_PER_FILE = 20;

/** The file a row of episode `episodeId` lives in: "0003.jsonl" for episodes 41–60. */
export function exFileFor(episodeId) {
    return `${String(Math.ceil(episodeId / EPISODES_PER_FILE)).padStart(4, '0')}.jsonl`;
}

export function listExampleFiles() {
    if (!fs.existsSync(EX_DIR)) return [];
    return fs.readdirSync(EX_DIR).filter((f) => f.endsWith('.jsonl')).sort();
}

/** Every row of `files`, with where it came from. Throws on a line that is not JSON. */
export function readExampleRows(files = listExampleFiles()) {
    const rows = [];
    for (const file of files) {
        const full = path.join(EX_DIR, file);
        if (!fs.existsSync(full)) continue;
        fs.readFileSync(full, 'utf-8')
            .split('\n')
            .forEach((text, i) => {
                const trimmed = text.trim();
                if (!trimmed) return;
                let row;
                try {
                    row = JSON.parse(trimmed);
                } catch {
                    throw new Error(`${file}:${i + 1} is not valid JSON: ${trimmed.slice(0, 80)}`);
                }
                rows.push({ row, file, line: i + 1 });
            });
    }
    return rows;
}

export function writeExampleFile(file, rows) {
    fs.mkdirSync(EX_DIR, { recursive: true });
    fs.writeFileSync(path.join(EX_DIR, file), rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
}

/** Ready to ship: a sentence holding the word, a translation, nothing left to check. */
export function isComplete(row) {
    return Boolean(row.ex && row.hit && row.vi && !row.check && row.ex.includes(row.hit));
}

/**
 * Every (word, definition) pair in the corpus, in first-appearance order:
 * key → { word, definition, type, episodes }.
 */
export function corpusPairs() {
    const pairs = new Map();
    for (let id = 1; id <= LAST_EPISODE; id++) {
        for (const item of readEpisodeItems(id) ?? []) {
            const key = vocabKey(item.word, item.definition);
            const pair = pairs.get(key);
            if (pair) {
                if (!pair.episodes.includes(id)) pair.episodes.push(id);
            } else {
                pairs.set(key, {
                    word: item.word,
                    definition: item.definition,
                    type: item.type,
                    episodes: [id],
                });
            }
        }
    }
    return pairs;
}

/** Straight apostrophes and single spaces: the form sentences are stored and compared in. */
export function plain(text) {
    return String(text ?? '')
        .replace(/[’‘]/g, "'")
        .replace(/\s+/g, ' ')
        .trim();
}

// Abbreviations whose full stop does not end a sentence.
const ABBREVIATION = /\b(Mr|Mrs|Ms|Dr|St|Jr|Sr|vs)\./g;

/** "Hi. How are you?" → ["Hi.", "How are you?"]. */
export function splitSentences(text) {
    const guarded = plain(text).replace(ABBREVIATION, '$1\u0000');
    return (guarded.match(/[^.!?]+(?:[.!?]+["')\]]*|$)/g) ?? [])
        .map((s) => s.replace(/\u0000/g, '.').trim())
        .filter(Boolean);
}

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const BEFORE = "(?<![A-Za-z0-9'])";
const AFTER = '(?![A-Za-z0-9])';

/**
 * Where `word` occurs in `text`: { hit, exact } with `hit` exactly as written
 * in plain(text), or null.
 *
 * Exact: the words of `word` (minus placeholders like "(someone)") in a row.
 * Loose: each word's stem in order, at most two words apart — so "grab" finds
 * "grabbed" and "stand (someone) up" finds "stand her up". Loose hits need a
 * human look (they also find "grand" for "grab").
 */
export function findHit(text, word) {
    const tokens = plain(word)
        .replace(/\([^)]*\)/g, ' ')
        .toLowerCase()
        .match(/[a-z0-9']+/g);
    if (!tokens) return null;
    const source = plain(text);

    const exact = new RegExp(BEFORE + tokens.map(escapeRegExp).join('\\s+') + AFTER, 'i').exec(source);
    if (exact) return { hit: exact[0], exact: true };

    const stem = (t) => (t.length <= 3 ? t : t.slice(0, Math.max(3, t.length - 2)));
    const loose = new RegExp(
        BEFORE +
            tokens.map((t) => `${escapeRegExp(stem(t))}[A-Za-z']*`).join("(?:\\s+[A-Za-z']+){0,2}?\\s+") +
            AFTER,
        'i',
    ).exec(source);
    return loose ? { hit: loose[0], exact: false } : null;
}
```

- [ ] **Step 2: Create `scripts/extract_examples.js`**

```js
/**
 * Drafts scripts/data/vocab-ex/*.jsonl from the dialogues: for every
 * (word, definition) pair, the shortest dialogue sentence holding the word
 * (an exact match beats a loose one). Loose matches are marked "check": true;
 * pairs no dialogue line holds get an empty "written" row to author.
 *
 * Rows that already have a sentence or a translation are kept as they are, so
 * this is safe to re-run while the data is being written.
 *
 * Usage:
 *   node scripts/extract_examples.js
 */

import { vocabKey } from '../src/lib/vocabulary.ts';
import {
    corpusPairs,
    exFileFor,
    findHit,
    readExampleRows,
    splitSentences,
    writeExampleFile,
} from './lib/examples.js';
import { readDialogueLines } from './lib/transcripts.js';

const dialogue = new Map();
function sentencesOf(episodeId) {
    if (!dialogue.has(episodeId)) {
        dialogue.set(episodeId, readDialogueLines(episodeId).flatMap(splitSentences));
    }
    return dialogue.get(episodeId);
}

function draft(pair) {
    let best = null;
    for (const ep of pair.episodes) {
        for (const sentence of sentencesOf(ep)) {
            const found = findHit(sentence, pair.word);
            if (!found) continue;
            const better =
                !best ||
                (found.exact && !best.exact) ||
                (found.exact === best.exact && sentence.length < best.ex.length);
            if (better) best = { ex: sentence, hit: found.hit, exact: found.exact, ep };
        }
    }
    const base = { w: pair.word, d: pair.definition };
    if (!best) return { ...base, ex: '', hit: '', src: 'written', ep: pair.episodes[0], vi: '' };
    return {
        ...base,
        ex: best.ex,
        hit: best.hit,
        src: 'dialogue',
        ep: best.ep,
        vi: '',
        ...(best.exact ? {} : { check: true }),
    };
}

const existing = new Map(readExampleRows().map(({ row }) => [vocabKey(row.w, row.d), row]));
const files = new Map();
const counts = { kept: 0, exact: 0, loose: 0, written: 0 };

for (const [key, pair] of corpusPairs()) {
    const old = existing.get(key);
    let row;
    if (old && (old.ex || old.vi)) {
        row = old;
        counts.kept++;
    } else {
        row = draft(pair);
        if (row.src === 'written') counts.written++;
        else if (row.check) counts.loose++;
        else counts.exact++;
    }
    const file = exFileFor(row.ep);
    if (!files.has(file)) files.set(file, []);
    files.get(file).push(row);
}

for (const [file, rows] of files) writeExampleFile(file, rows);

console.log(`${files.size} files written`);
console.log(
    `kept ${counts.kept} authored rows; drafted ${counts.exact} exact, ` +
        `${counts.loose} loose (check), ${counts.written} to write`,
);
```

- [ ] **Step 3: Run it**

Run: `node scripts/extract_examples.js && ls scripts/data/vocab-ex && head -3 scripts/data/vocab-ex/0001.jsonl`
Expected: `19 files written`, roughly `kept 0 …; drafted ~2200 exact, ~600 loose (check), ~1700 to write` (total 4552). First row of 0001 is `{"w":"grab","d":"get quickly","ex":"…","hit":"…","src":"dialogue","ep":1,"vi":""}` or a loose/written row.

- [ ] **Step 4: Re-run is idempotent**

Run: `md5 -q scripts/data/vocab-ex/*.jsonl > /tmp/ex1 && node scripts/extract_examples.js && md5 -q scripts/data/vocab-ex/*.jsonl | diff /tmp/ex1 - && echo identical`
Expected: the second run reports `kept` = the first run's exact + loose (those rows now have `ex`) and drafts only the empty `written` rows again, which come out the same; prints `identical`.

- [ ] **Step 5: Lint and commit**

```bash
npm run lint
git add scripts/lib/examples.js scripts/extract_examples.js scripts/data/vocab-ex
git commit -m "feat: draft example sentences for every vocabulary pair from the dialogues

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Verify the example data

**Files:** Create `scripts/verify_examples.js`

- [ ] **Step 1: Create the script**

```js
/**
 * Checks scripts/data/vocab-ex/*.jsonl against the transcripts. Reports each
 * problem by file and line.
 *
 * Usage:
 *   node scripts/verify_examples.js              # every file, fails on any problem
 *   node scripts/verify_examples.js --file=0003  # one file (and pairs that belong in it)
 *   node scripts/verify_examples.js --summary    # unfinished rows per file; never fails
 */

import { vocabKey } from '../src/lib/vocabulary.ts';
import {
    corpusPairs,
    exFileFor,
    isComplete,
    listExampleFiles,
    plain,
    readExampleRows,
    splitSentences,
} from './lib/examples.js';
import { readDialogueLines } from './lib/transcripts.js';

const only = process.argv.find((a) => a.startsWith('--file='))?.slice('--file='.length);
const summary = process.argv.includes('--summary');
const files = only ? [`${only}.jsonl`] : listExampleFiles();

const pairs = corpusPairs();
const allRows = readExampleRows();
const rows = only ? allRows.filter((r) => r.file === files[0]) : allRows;

if (summary) {
    const byFile = new Map();
    for (const { row, file } of rows) {
        const s = byFile.get(file) ?? { rows: 0, done: 0, write: 0, check: 0, translate: 0 };
        s.rows++;
        if (isComplete(row)) s.done++;
        else if (!row.ex) s.write++;
        else if (row.check) s.check++;
        else s.translate++;
        byFile.set(file, s);
    }
    let left = 0;
    for (const [file, s] of byFile) {
        left += s.rows - s.done;
        console.log(
            `${file}  ${s.done}/${s.rows} done · ${s.write} to write · ${s.check} to check · ${s.translate} to translate`,
        );
    }
    console.log(`\n${left} rows unfinished`);
    process.exit(0);
}

const problems = [];
const fail = (where, message) => problems.push(`${where}: ${message}`);

const dialogue = new Map();
const linesOf = (ep) => {
    if (!dialogue.has(ep)) dialogue.set(ep, readDialogueLines(ep).map(plain));
    return dialogue.get(ep);
};

const seen = new Set();
for (const { row, file, line } of rows) {
    const where = `${file}:${line} "${row.w}"`;
    const key = vocabKey(row.w ?? '', row.d ?? '');
    const pair = pairs.get(key);
    if (!pair) {
        fail(where, 'no such (word, definition) pair in the transcripts');
        continue;
    }
    if (seen.has(key)) {
        fail(where, 'duplicate row');
        continue;
    }
    seen.add(key);

    if (!pair.episodes.includes(row.ep)) fail(where, `episode ${row.ep} does not teach this word`);
    else if (exFileFor(row.ep) !== file) fail(where, `belongs in ${exFileFor(row.ep)}`);

    if (!row.ex || !row.hit || !row.vi) {
        fail(where, 'ex, hit and vi must all be filled in');
        continue;
    }
    if (row.check) fail(where, 'still marked "check"');
    if (row.src !== 'dialogue' && row.src !== 'written') fail(where, 'src must be "dialogue" or "written"');
    if (row.ex !== plain(row.ex)) fail(where, 'use straight apostrophes and single spaces');
    if (!row.ex.includes(row.hit)) fail(where, `hit "${row.hit}" is not in the sentence`);
    if (splitSentences(row.ex).length !== 1) fail(where, 'more than one sentence');
    if (row.src === 'dialogue' && !linesOf(row.ep).some((l) => l.includes(row.ex))) {
        fail(where, `sentence is not in episode ${row.ep}'s dialogue`);
    }
    const words = row.ex.split(' ').length;
    if (row.src === 'written' && (words < 4 || words > 20)) {
        fail(where, `${words} words; a written sentence has 4–20`);
    }
}

// Pairs with no row anywhere. With --file, only those whose first episode files there.
const everyKey = new Set(allRows.map(({ row }) => vocabKey(row.w ?? '', row.d ?? '')));
for (const [key, pair] of pairs) {
    if (everyKey.has(key)) continue;
    const home = exFileFor(pair.episodes[0]);
    if (only && home !== files[0]) continue;
    fail(home, `missing a row for "${pair.word}" — ${pair.definition}`);
}

console.log(`${rows.length} rows in ${files.length} file(s), ${pairs.size} pairs in the corpus`);
if (problems.length) {
    console.log(`\n${problems.length} problem(s):`);
    for (const p of problems.slice(0, 80)) console.log(`  - ${p}`);
    if (problems.length > 80) console.log(`  … and ${problems.length - 80} more`);
    process.exit(1);
}
console.log('All example checks passed.');
```

- [ ] **Step 2: Run it on the drafts (expected to fail on unfinished rows only)**

Run: `node scripts/verify_examples.js --summary && node scripts/verify_examples.js; echo "exit $?"`
Expected: the summary lists 19 files with 0 done; the full run exits 1 and the problems are only `ex, hit and vi must all be filled in` (no "not in the dialogue", "not in the sentence", "missing a row", "belongs in"). Any other problem kind is a bug in Task 2 — fix it there.

- [ ] **Step 3: Lint and commit**

```bash
npm run lint
git add scripts/verify_examples.js
git commit -m "feat: verify example-sentence data against the transcripts

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Ship examples in the vocab files

**Files:**
- Modify: `scripts/build_vocab.js`
- Modify: `src/types.ts`

- [ ] **Step 1: Types**

In `src/types.ts`, inside `interface VocabEntry` after `viDef?: string`, add:

```ts
  /** Example sentence (one sentence, from the dialogue or written for it). */
  ex?: string
  /** `ex`'s text for the word itself, exactly as it occurs there ("grabbed" for "grab"). */
  exHit?: string
  /** Vietnamese translation of `ex`. */
  exVi?: string
```

- [ ] **Step 2: Merge in build_vocab.js**

Add to the imports:

```js
import { isComplete, readExampleRows } from './lib/examples.js';
```

Add after `loadTranslations()`:

```js
/** (word, definition) → { ex, exHit, exVi } for every finished example row. */
function loadExamples() {
    const map = new Map();
    for (const { row } of readExampleRows()) {
        if (isComplete(row)) map.set(vocabKey(row.w, row.d), { ex: row.ex, exHit: row.hit, exVi: row.vi });
    }
    return map;
}
```

In `main()`, after `const cmudict = await loadCmudict();` add:

```js
    const examples = loadExamples();
    let exampleHits = 0;
```

Replace the `entries.push({ … })` call with:

```js
            // Examples are optional: the app simply skips the sentence games for
            // a word without one.
            const example = examples.get(vocabKey(item.word, item.definition));
            if (example) exampleHits++;
            entries.push({
                word: item.word,
                ipa,
                type: item.type,
                def: item.definition,
                vi: hit.vi,
                viDef: hit.viDef,
                ...example,
            });
```

After the `console.log(\`IPA: …\`)` line add:

```js
    console.log(`Examples: ${exampleHits}/${totalItems}`);
```

- [ ] **Step 3: Run**

Run: `node scripts/build_vocab.js && git status --short public/vocab | head -3; npm run typecheck`
Expected: `Examples: 0/4638` (no row is complete yet), no changes under `public/vocab`, typecheck passes.

- [ ] **Step 4: Commit**

```bash
git add scripts/build_vocab.js src/types.ts
git commit -m "feat: merge finished example sentences into the episode vocab files

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Author the example data (parallel, 19 files)

This is data work, not code. Dispatch it with superpowers:dispatching-parallel-agents: one subagent per file (or two files per agent), at most ~6 at a time. Each agent gets the brief below with `NNNN` filled in. Tasks 6–17 do not depend on it and can proceed meanwhile; partial data is fine for developing the app.

**Brief for each agent (copy verbatim, set NNNN):**

> You are completing `scripts/data/vocab-ex/NNNN.jsonl` in the repo at `/Users/nguyensang/Documents/projects/english-pod`. Each line is one JSON object for a vocabulary item from the EnglishPod podcast: `w` (word/phrase), `d` (its English definition — the sense to use), `ex` (one English example sentence), `hit` (the exact substring of `ex` that is the word, as it appears there, e.g. "grabbed" for "grab"), `src` (`dialogue` or `written`), `ep` (episode number), `vi` (Vietnamese translation of the whole sentence), and sometimes `check: true`.
>
> Rules:
> 1. Do not change `w`, `d`, or the order of lines. Edit the file in place; keep one JSON object per line, UTF-8, no trailing commas.
> 2. `src: "dialogue"` rows with `ex` filled and no `check`: only fill `vi`.
> 3. Rows with `check: true`: the sentence came from the dialogue by a loose match. Decide whether `hit` really is the word `w` used in the sense `d` (an inflection like "grabbed" for "grab", or "stand her up" for "stand (someone) up" is fine; an unrelated word like "grand" for "grab" is not). If it is: fix `hit` if needed so it covers exactly the word/phrase, delete `check`, fill `vi`. If it is not: turn the row into a written one (rule 4) and delete `check`.
> 4. `src: "written"` rows (empty `ex`): write ONE natural English sentence of 6–14 words (4–20 allowed) that uses `w` in the sense `d`, in everyday spoken style like the podcast; the topic of episode `ep` (look its title up in `src/data/episodes.json` by `id`) is a good setting. Put the word as written in `hit` (it must be an exact substring of `ex`, same case). Keep `src: "written"` and `ep` as they are.
> 5. `ex` must be exactly one sentence, with straight apostrophes (') and single spaces. For dialogue rows do not edit `ex` except to fix nothing — if a dialogue sentence is unusable (e.g. only "Yes." or it uses the word in a different sense), replace the row's content per rule 4 and set `src` to `written`.
> 6. `vi`: a natural Vietnamese translation of the whole sentence (not word by word), consistent with the sense `d`.
> 7. When done, run `source ~/.nvm/nvm.sh && nvm use 22.18.0 >/dev/null && node scripts/verify_examples.js --file=NNNN` and fix every problem it reports until it prints "All example checks passed." Do not edit any other file. Do not commit. Report the final verify output.

- [ ] **Step 1: Dispatch agents for 0001–0019**, then wait for all reports.
- [ ] **Step 2: Spot-check quality** — for 3 random files, read 15 random rows each (`shuf -n 15 scripts/data/vocab-ex/0007.jsonl`): written sentences natural and in the right sense, `vi` natural. Fix or send back bad files.
- [ ] **Step 3: Verify everything**

Run: `node scripts/verify_examples.js && node scripts/build_vocab.js`
Expected: `All example checks passed.` and `Examples: 4638/4638`.

- [ ] **Step 4: Commit**

```bash
git add scripts/data/vocab-ex public/vocab
git commit -m "feat: example sentence and translation for every vocabulary word

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: `speak` with a rate

**Files:** Modify `src/lib/speech.ts` (the `speak` function)

- [ ] **Step 1: Change the signature**

Replace

```ts
/** Read an English word or phrase aloud, slowly, for learners. */
export function speak(text: string | null | undefined) {
  if (!text || !synth) return
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = 'en-US'
  utterance.rate = 0.8
```

with

```ts
/**
 * Read English aloud, a little slowly, for learners. `rate` overrides the
 * speed (dictation offers a slower one).
 */
export function speak(text: string | null | undefined, { rate = 0.8 }: { rate?: number } = {}) {
  if (!text || !synth) return
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = 'en-US'
  utterance.rate = rate
```

- [ ] **Step 2: Check and commit**

Run: `npm run typecheck && npm run lint`
Expected: both pass (every existing call passes one argument).

```bash
git add src/lib/speech.ts
git commit -m "feat: let speak() take a speech rate

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Stage-based kinds, cloze, dictation grading, leeches (pure logic)

**Files:**
- Modify: `scripts/verify_quiz.js`
- Modify: `src/lib/srs.ts`
- Modify: `src/lib/quiz.ts`

- [ ] **Step 1: Write the failing checks in `scripts/verify_quiz.js`**

Change the import from `quiz.ts` to also take `gradeDictation`, and add `import { isLeech } from '../src/lib/srs.ts';` next to `cardId`.

In `loadCards()`, make each card a reviewed, young card with its example:

```js
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
                interval: 1,
                lapses: 0,
                example: entry.ex ? { ex: entry.ex, hit: entry.exHit, vi: entry.exVi } : null,
            });
```

Add after `checkSpellingOf`:

```js
function checkExampleOf(card) {
    const { example } = card;
    if (!example) return;
    const where = `"${card.word}" (example)`;
    if (!example.ex.includes(example.hit)) fail(`${where}: hit is not in the sentence`);
    if (!lettersOf(example.hit)) fail(`${where}: cloze has no letters to type`);
    if (!checkSpelling(example.hit, example.hit)) fail(`${where}: cloze rejects its own answer`);
    const full = gradeDictation(example.ex, example.ex, example.hit);
    if (!full.targetCorrect || full.accuracy !== 1) {
        fail(`${where}: dictation of the sentence itself is not fully right`);
    }
    if (!full.words.some((w) => w.target)) fail(`${where}: dictation finds no target word`);
    if (gradeDictation('', example.ex, example.hit).targetCorrect) {
        fail(`${where}: an empty dictation counts as right`);
    }
}
```

In `checkRules(rng)`, give the existing cards `interval: 0` (`newCard` gets `interval: 0, lapses: 0`; `silentEmpty` keeps the spread) and append at the end of the function:

```js
    const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
    const card = { ...newCard, lapses: 0 };
    const stages = [
        ['seed', { state: 'new', interval: 0 }, true, true, ['meaning', 'listen']],
        ['sprout', { state: 'learning', interval: 0 }, true, true, ['meaning', 'listen', 'spell']],
        ['bud', { state: 'review', interval: 5 }, true, true, ['listen', 'spell', 'cloze']],
        ['bloom', { state: 'review', interval: 30 }, true, true, ['cloze', 'dictation']],
        ['bloom, no example', { state: 'review', interval: 30 }, true, false, ['listen', 'spell']],
        ['bloom, no speech', { state: 'review', interval: 30 }, false, true, ['cloze']],
        ['relearning', { state: 'relearning', interval: 30 }, true, true, ['meaning', 'listen', 'spell']],
    ];
    for (const [name, patch, canSpeak, hasExample, want] of stages) {
        const got = allowedKinds({ ...card, ...patch }, { canSpeak, hasExample });
        if (!same(got, want)) fail(`rules: ${name} allows ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
    }
    const bloom = { ...card, state: 'review', interval: 30 };
    for (let i = 0; i < 50; i++) {
        const q = makeQuestion(bloom, [bloom], [], { canSpeak: true, hasExample: true }, rng);
        if (!q || (q.kind !== 'cloze' && q.kind !== 'dictation')) {
            fail(`rules: a bloom card got ${q?.kind}`);
            break;
        }
    }

    const sentence = "I'll go with the spaghetti.";
    const dictation = [
        ["I'll go with the spaghetti", true, 1],
        ['I’ll go with the spaghetti', true, 1],
        ['ill go with spaghetti', true, 3 / 5],
        ["I'll go the spaghetti", false, 4 / 5],
        ["I'll go with the the spaghetti", true, 1],
    ];
    for (const [input, targetCorrect, accuracy] of dictation) {
        const got = gradeDictation(input, sentence, 'go with');
        if (got.targetCorrect !== targetCorrect || Math.abs(got.accuracy - accuracy) > 1e-9) {
            fail(
                `rules: gradeDictation(${JSON.stringify(input)}) = ${got.targetCorrect}/${got.accuracy}, ` +
                    `want ${targetCorrect}/${accuracy}`,
            );
        }
    }
    const extra = gradeDictation("I'll go with the the spaghetti", sentence, 'go with');
    if (extra.words.filter((w) => w.status === 'extra').length !== 1) {
        fail('rules: a repeated word should show as one extra');
    }

    if (isLeech({ lapses: 3 }) || !isLeech({ lapses: 4 })) fail('rules: a leech is 4 or more lapses');
```

In the main loop over `cards`, after `checkSpellingOf(card);` add `checkExampleOf(card);`.

- [ ] **Step 2: Run to see it fail**

Run: `node scripts/verify_quiz.js; echo "exit $?"`
Expected: crashes or exits 1 with `gradeDictation is not a function`/`isLeech` import errors (SyntaxError: does not provide an export named 'gradeDictation').

- [ ] **Step 3: `src/lib/srs.ts`**

Change `stageOf` to take only what it reads:

```ts
/** Garden stage shown in the UI. */
export function stageOf(card: Pick<Card, 'state' | 'interval'>): Stage {
```

Add after `MATURE_INTERVAL`:

```ts
// Forgotten this many times after being learnt, a word is a "leech": it is
// flagged in the UI and always shown with its example sentence.
export const LEECH_LAPSES = 4

export function isLeech(card: Pick<Card, 'lapses'>): boolean {
  return card.lapses >= LEECH_LAPSES
}
```

- [ ] **Step 4: `src/lib/quiz.ts`**

Update the header comment's kinds list to:

```ts
// Five kinds of question, chosen by the card's garden stage (KINDS_BY_STAGE):
//   meaning   → the word is shown, pick its meaning among up to 4
//   listen    → the word is spoken, pick how it is written among up to 4
//   spell     → the meaning is shown, type the word into letter cells
//   cloze     → the example sentence with the word blanked out, type it
//   dictation → the example sentence is spoken, type the whole sentence
```

Replace the imports and type declarations down to `export const KINDS` with:

```ts
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
```

Delete `export const KINDS: QuestionKind[] = ['meaning', 'spell', 'listen']` (check first: `grep -rn "KINDS\b" src scripts` — only quiz.ts uses it).

Replace `allowedKinds` with:

```ts
/**
 * The kinds that can be asked about this card: those of its stage that it can
 * support, or — when none can — those of the stage before, and so on.
 */
export function allowedKinds(card: QuizCard, { canSpeak, hasExample = false }: QuizContext): QuestionKind[] {
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
```

In `makeQuestion`, change the parameter `{ canSpeak }: { canSpeak: boolean }` to `context: QuizContext`, the first line to `let kinds = allowedKinds(card, context)`, and the early return to:

```ts
    if (kind === 'spell' || kind === 'cloze' || kind === 'dictation') return { kind }
```

Update its doc comment's first sentence to: `The question to ask about \`card\`, or null when none can be asked (no meaning, no speech, no example).`

Append at the end of the file:

```ts
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
  return [...String(text).normalize('NFC').matchAll(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu)].map(
    (m) => ({ text: m[0], start: m.index, end: m.index + m[0].length }),
  )
}

const wordKey = (word: string) => word.toLowerCase().replace(/’/g, "'")

/**
 * Grade a dictation word by word: case and punctuation do not count. The
 * typed words are lined up with the sentence's by their longest common
 * subsequence, so one missing or extra word does not throw off the rest.
 */
export function gradeDictation(input: string, sentence: string, hit: string): DictationResult {
  const want = wordsOf(sentence)
  const got = wordsOf(input)
  const hitStart = sentence.indexOf(hit)
  const hitEnd = hitStart + hit.length
  const isTarget = (w: { start: number; end: number }) =>
    hitStart >= 0 && w.start < hitEnd && w.end > hitStart

  // lcs[i][j]: longest common run of want[i..] and got[j..].
  const lcs = Array.from({ length: want.length + 1 }, () => new Array<number>(got.length + 1).fill(0))
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
```

- [ ] **Step 5: Run the checks**

Run: `node scripts/verify_quiz.js && npm run typecheck`
Expected: `All quiz checks passed.` and typecheck passes (GameSession's `{ canSpeak }` is still a valid `QuizContext`).

- [ ] **Step 6: Format, lint, commit**

```bash
npm run format && npm run lint
git add scripts/verify_quiz.js src/lib/srs.ts src/lib/quiz.ts
git commit -m "feat: choose question kinds by garden stage, add cloze and dictation grading

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Load examples in the app

**Files:** Create `src/lib/examples.ts`

- [ ] **Step 1: Create the module**

```ts
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
```

- [ ] **Step 2: Check and commit**

Run: `npm run format && npm run typecheck && npm run lint`
Expected: all pass.

```bash
git add src/lib/examples.ts
git commit -m "feat: load example sentences from the episode vocab files on demand

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: ExampleSentence, LeechBadge, TappableText highlight

**Files:**
- Modify: `src/components/TappableText.tsx`
- Create: `src/components/vocab/ExampleSentence.tsx`
- Create: `src/components/vocab/LeechBadge.tsx`

- [ ] **Step 1: TappableText `highlight`**

Change the props interface to:

```ts
interface TappableTextProps {
  text: string | null | undefined
  className?: string
  /** Shown in bold where it first occurs in `text` (the word an example is about). */
  highlight?: string
}
```

Change the signature to `export default function TappableText({ text, className, highlight }: TappableTextProps) {`, and after `const parts = text.split(WORD) // odd indexes are words` add:

```ts
  // Character range of the highlight, and where each part starts.
  const from = highlight ? text.indexOf(highlight) : -1
  const to = from + (highlight?.length ?? 0)
  const starts = parts.map((_, i) => parts.slice(0, i).join('').length)
  const highlighted = (i: number) =>
    from >= 0 && starts[i] < to && starts[i] + parts[i].length > from
```

and change the word span's `className` to:

```tsx
            className={classNames(
              'tap-word',
              lookup?.index === i && 'tap-word-active',
              highlighted(i) && 'font-bold text-emerald-600 dark:text-emerald-400',
            )}
```

adding `import classNames from 'classnames'` at the top.

- [ ] **Step 2: Create `src/components/vocab/ExampleSentence.tsx`**

```tsx
import type { SyntheticEvent } from 'react'
import { Volume2 } from 'lucide-react'
import classNames from 'classnames'
import type { Example } from '../../lib/examples'
import { speak } from '../../lib/speech'
import TappableText from '../TappableText'

/**
 * An example sentence: the English with the word in bold (each word can be
 * tapped for a translation), a button that reads it aloud, and the
 * Vietnamese. Pointer and click events stop here, so it can sit on a
 * flashcard without flipping or dragging it.
 */
export default function ExampleSentence({
  example,
  className,
}: {
  example: Example
  className?: string
}) {
  const stop = (e: SyntheticEvent) => e.stopPropagation()
  return (
    // Only stops events (see above); the button inside is the control.
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events
    <div
      className={classNames('flex items-start gap-2 text-left', className)}
      onPointerDown={stop}
      onPointerUp={stop}
      onClick={stop}
    >
      <button
        type='button'
        onClick={() => speak(example.ex)}
        title='Nghe câu'
        aria-label='Nghe câu'
        className='flex-none p-1.5 rounded-full text-zinc-500 hover:bg-black/5 dark:text-zinc-400 dark:hover:bg-white/10'
      >
        <Volume2 size={16} />
      </button>
      <div className='min-w-0'>
        <TappableText
          text={example.ex}
          highlight={example.hit}
          className='text-base text-zinc-700 dark:text-zinc-300'
        />
        <p className='vi-text mt-0.5 text-sm text-indigo-600 dark:text-indigo-400'>{example.vi}</p>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create `src/components/vocab/LeechBadge.tsx`**

```tsx
import { RotateCcw } from 'lucide-react'
import classNames from 'classnames'

/** "Hay quên": the word has been forgotten again and again (srs.isLeech). */
export default function LeechBadge({ className }: { className?: string }) {
  return (
    <span
      title='Bạn đã quên từ này nhiều lần'
      className={classNames(
        'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300',
        className,
      )}
    >
      <RotateCcw size={12} />
      Hay quên
    </span>
  )
}
```

- [ ] **Step 4: Check and commit**

Run: `npm run format && npm run typecheck && npm run lint`
Expected: all pass.

```bash
git add src/components/TappableText.tsx src/components/vocab/ExampleSentence.tsx src/components/vocab/LeechBadge.tsx
git commit -m "feat: example sentence and leech badge components

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Flashcards show the example and the leech badge

**Files:**
- Modify: `src/components/vocab/Flashcard.tsx`
- Modify: `src/components/vocab/StudySession.tsx`

- [ ] **Step 1: Flashcard**

Imports: add `isLeech` to the `../../lib/srs` import, and

```ts
import type { Example } from '../../lib/examples'
import ExampleSentence from './ExampleSentence'
import LeechBadge from './LeechBadge'
```

Props: add `example?: Example | null` to `FlashcardProps` (doc: `/** Shown on the back under the definition. */`) and to the destructuring.

Replace both `<StageBadge stage={stage} isNew={card.state === 'new'} />` lines with `<Badges card={card} stage={stage} />`, and add next to `StageBadge`:

```tsx
function Badges({ card, stage }: { card: StoredCard; stage: StageStyle }) {
  return (
    <div className='flex flex-wrap gap-1.5'>
      <StageBadge stage={stage} isNew={card.state === 'new'} />
      {isLeech(card) && <LeechBadge />}
    </div>
  )
}
```

On the back face, right after the closing `)}` of the `(card.def || card.viDef) && (…)` block (still inside the scrolling `div`), add:

```tsx
              {example && (
                <div className='mt-5 w-full max-w-xs flex-none text-left'>
                  <p className='text-[11px] font-semibold uppercase tracking-wider text-zinc-400'>
                    Example
                  </p>
                  <ExampleSentence example={example} className='mt-0.5 -ml-2' />
                </div>
              )}
```

- [ ] **Step 2: StudySession**

Add `import { episodeIdsOf, exampleOf, useExamples } from '../../lib/examples'`.

Replace `const [queue, setQueue] = useState(() => buildQueue(srs, Date.now(), episodeId))` with:

```tsx
  const [start] = useState(() => {
    const queue = buildQueue(srs, Date.now(), episodeId)
    return { queue, episodeIds: episodeIdsOf(queue.map((id) => srs.cards[id])) }
  })
  const [queue, setQueue] = useState(start.queue)
  // Cards show at once; their example sentences appear when the files arrive.
  const examplesReady = useExamples(start.episodeIds)
```

Pass the example to the card: in `<Flashcard … />` add `example={examplesReady ? exampleOf(card) : null}`.

- [ ] **Step 3: Check, drive, commit**

Run: `npm run format && npm run typecheck && npm run lint`
Expected: pass.

Drive (skill `run` or manually): `npm run dev`, open `#vocab`, add episode 1's deck if the garden is empty, `#vocab/study`, flip a card: an "Example" block shows for words whose rows are complete (none before Task 5 lands — to test early, fill `vi` on two rows of `scripts/data/vocab-ex/0001.jsonl`, run `node scripts/build_vocab.js --episodes=1`, then `git checkout scripts/data/vocab-ex/0001.jsonl public/vocab` afterwards). Tapping the speaker reads the sentence and does not flip the card. To see the badge, in DevTools: `s=JSON.parse(localStorage.englishpod_srs_v1); Object.values(s.cards)[0].lapses=4; localStorage.englishpod_srs_v1=JSON.stringify(s)` and reload.

```bash
git add src/components/vocab/Flashcard.tsx src/components/vocab/StudySession.tsx
git commit -m "feat: show the example sentence and leech badge on flashcards

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Cloze on top of SpellQuestion

**Files:**
- Modify: `src/components/vocab/SpellQuestion.tsx`
- Create: `src/components/vocab/ClozeQuestion.tsx`

- [ ] **Step 1: Generalize SpellQuestion**

Imports: add `ReactNode` to the `react` type import, and

```ts
import type { Example } from '../../lib/examples'
import ExampleSentence from './ExampleSentence'
```

Replace `SpellQuestionProps` and the start of the component with:

```tsx
interface SpellQuestionProps {
  card: StoredCard
  /** What has to be typed; the card's word by default (cloze: the word as it occurs in the sentence). */
  target?: string
  /** Instruction above the question. */
  label?: string
  /** Shown above the cells; the meaning by default. */
  prompt?: ReactNode
  /** Read aloud once answered; the card's word by default. */
  spoken?: string
  /** Shown once answered (cloze; leeches). */
  example?: Example | null
  onDone: (result: { correct: boolean; hinted: boolean; attempts: number }) => void
}

/**
 * Điền từ: the meaning is shown and the word is typed into letter cells.
 * A hidden <input> takes the keyboard so phones open theirs; the cells only
 * draw what it holds. `onDone({ correct, hinted, attempts })` is called when
 * the learner moves on. ClozeQuestion reuses it with a sentence as the prompt.
 */
export default function SpellQuestion({
  card,
  target,
  label = 'Viết từ tiếng Anh',
  prompt,
  spoken,
  example = null,
  onDone,
}: SpellQuestionProps) {
  const word = target ?? card.word
  const wordSegments = maskWord(word).map(segmentsOf)
  const maxSegmentLength = Math.max(1, ...wordSegments.flat().map((segment) => segment.length))
  const cellSize = cellSizing(maxSegmentLength)
  const answer = lettersOf(word)
```

Then in the body:
- `finish`: `speak(spoken ?? card.word)`.
- `check`: `if (checkSpelling(typed, word)) return finish('right')`.
- `<QuestionCard label='Viết từ tiếng Anh'>` → `<QuestionCard label={label}>`.
- Replace the two default prompt paragraphs (meaning + `card.def`) with:

```tsx
        {prompt ?? (
          <>
            <p className='vi-text mt-3 text-2xl font-bold text-indigo-600 dark:text-indigo-400'>
              {meaningOf(card)}
            </p>
            {card.vi && card.def && (
              <p className='mt-1 text-sm text-zinc-500 dark:text-zinc-400'>{card.def}</p>
            )}
          </>
        )}
```

- After the `{result && ( … word + ipa + speaker … )}` block, still inside `QuestionCard`, add:

```tsx
        {result && example && <ExampleSentence example={example} className='mt-4 vocab-rise-in' />}
```

- [ ] **Step 2: Create `src/components/vocab/ClozeQuestion.tsx`**

```tsx
import { meaningOf } from '../../lib/quiz'
import type { Example } from '../../lib/examples'
import type { StoredCard } from '../../lib/srsStore'
import SpellQuestion from './SpellQuestion'

interface ClozeQuestionProps {
  card: StoredCard
  example: Example
  onDone: (result: { correct: boolean; hinted: boolean; attempts: number }) => void
}

/**
 * Điền vào câu: the example sentence with the word blanked out, and the
 * word's meaning as a clue. The word is typed as it occurs in the sentence
 * ("grabbed", not "grab"); hints, retries and grading are Điền từ's.
 */
export default function ClozeQuestion({ card, example, onDone }: ClozeQuestionProps) {
  const at = example.ex.indexOf(example.hit)
  return (
    <SpellQuestion
      card={card}
      target={example.hit}
      label='Điền từ còn thiếu'
      spoken={example.ex}
      example={example}
      onDone={onDone}
      prompt={
        <>
          <p className='vi-text mt-3 text-lg font-bold text-indigo-600 dark:text-indigo-400'>
            {meaningOf(card)}
          </p>
          <p className='mt-3 text-xl leading-relaxed text-zinc-700 dark:text-zinc-200'>
            {example.ex.slice(0, at)}
            <span className='px-1 font-bold text-rose-500'>_____</span>
            {example.ex.slice(at + example.hit.length)}
          </p>
        </>
      }
    />
  )
}
```

- [ ] **Step 3: Check and commit**

Run: `npm run format && npm run typecheck && npm run lint`
Expected: pass. (Driven in Task 13 once GameSession can ask it.)

```bash
git add src/components/vocab/SpellQuestion.tsx src/components/vocab/ClozeQuestion.tsx
git commit -m "feat: cloze question built on the spelling question

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Dictation question

**Files:** Create `src/components/vocab/DictationQuestion.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { Snail, Volume2 } from 'lucide-react'
import classNames from 'classnames'
import { gradeDictation, meaningOf } from '../../lib/quiz'
import type { DictationResult, DictationStatus } from '../../lib/quiz'
import type { Example } from '../../lib/examples'
import type { StoredCard } from '../../lib/srsStore'
import { speak } from '../../lib/speech'
import { ContinueButton, QuestionCard } from './QuestionParts'

const SLOW_RATE = 0.55

const WORD_STYLES: Record<DictationStatus, string> = {
  ok: 'text-emerald-600 dark:text-emerald-400',
  missed: 'text-rose-600 dark:text-rose-400 underline decoration-wavy decoration-rose-400',
  extra: 'text-zinc-400 line-through',
}

interface DictationQuestionProps {
  card: StoredCard
  example: Example
  onDone: (result: { correct: boolean }) => void
}

/**
 * Chép chính tả: the example sentence is read out and typed back. It is graded
 * word by word (quiz.gradeDictation), but only the card's own word decides the
 * rating, so a slip elsewhere in the sentence costs nothing. One check only.
 */
export default function DictationQuestion({ card, example, onDone }: DictationQuestionProps) {
  const [typed, setTyped] = useState('')
  const [result, setResult] = useState<DictationResult | null>(null)
  const input = useRef<HTMLTextAreaElement>(null)
  const done = useRef(false)

  // A listening question: always read, whatever the auto-speak setting.
  useEffect(() => {
    input.current?.focus()
    speak(example.ex)
  }, [example.ex])

  const check = () => {
    if (result || !typed.trim()) return
    setResult(gradeDictation(typed, example.ex, example.hit))
  }

  const giveUp = () => {
    if (!result) setResult(gradeDictation('', example.ex, example.hit))
  }

  const next = () => {
    if (!result || done.current) return
    done.current = true
    onDone({ correct: result.targetCorrect })
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Enter' || e.shiftKey) return
    e.preventDefault()
    check()
  }

  return (
    <div className='w-full max-w-md mx-auto flex flex-col gap-5 vocab-pop-in'>
      <QuestionCard label='Nghe và chép lại cả câu'>
        <div className='mt-4 flex justify-center gap-3'>
          <button
            type='button'
            onClick={() => speak(example.ex)}
            title='Nghe lại'
            aria-label='Nghe lại'
            className='w-16 h-16 rounded-full bg-rose-500 text-white flex items-center justify-center shadow-lg shadow-rose-500/30 active:scale-95 transition'
          >
            <Volume2 size={28} />
          </button>
          <button
            type='button'
            onClick={() => speak(example.ex, { rate: SLOW_RATE })}
            title='Nghe chậm'
            aria-label='Nghe chậm'
            className='w-16 h-16 rounded-full bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300 flex items-center justify-center active:scale-95 transition'
          >
            <Snail size={28} />
          </button>
        </div>

        {result ? (
          <div className='mt-5 text-left vocab-rise-in'>
            <p className='text-lg leading-relaxed'>
              {result.words.map((w, i) => (
                <span key={i}>
                  <span className={classNames(WORD_STYLES[w.status], w.target && 'font-bold')}>
                    {w.text}
                  </span>{' '}
                </span>
              ))}
            </p>
            <p className='mt-1 text-xs text-zinc-500 dark:text-zinc-400'>
              Đúng {Math.round(result.accuracy * 100)}% số từ
            </p>
            <p className='vi-text mt-3 text-sm text-indigo-600 dark:text-indigo-400'>
              {example.vi}
            </p>
            <p className='mt-3 text-sm'>
              <span className='font-bold text-emerald-600 dark:text-emerald-400'>{card.word}</span>
              {card.ipa && <span className='text-zinc-400'> /{card.ipa}/</span>}
              <span className='vi-text text-zinc-600 dark:text-zinc-300'> · {meaningOf(card)}</span>
            </p>
          </div>
        ) : (
          <textarea
            ref={input}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={onKeyDown}
            rows={3}
            aria-label='Gõ lại câu vừa nghe'
            placeholder='Gõ lại câu bạn nghe được…'
            autoCapitalize='none'
            autoCorrect='off'
            autoComplete='off'
            spellCheck={false}
            enterKeyHint='done'
            className='mt-5 w-full resize-none rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-transparent p-3 text-base text-left outline-none focus:ring-2 focus:ring-rose-300 dark:focus:ring-rose-500/40'
          />
        )}
      </QuestionCard>

      {result ? (
        <ContinueButton correct={result.targetCorrect} onClick={next} />
      ) : (
        <div className='flex gap-2'>
          <button
            type='button'
            onClick={giveUp}
            className='px-4 py-3.5 rounded-2xl border border-zinc-200 text-zinc-600 font-semibold dark:border-zinc-700 dark:text-zinc-300 active:scale-[0.98] transition'
          >
            Bỏ qua
          </button>
          <button
            type='button'
            onClick={check}
            disabled={!typed.trim()}
            className='flex-1 py-3.5 rounded-2xl bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 font-bold shadow-lg active:scale-[0.98] transition disabled:opacity-40'
          >
            Kiểm tra
          </button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Check and commit**

Run: `npm run format && npm run typecheck && npm run lint`
Expected: pass.

```bash
git add src/components/vocab/DictationQuestion.tsx
git commit -m "feat: sentence dictation question

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: GameSession asks the new kinds

**Files:**
- Modify: `src/components/vocab/ChoiceQuestion.tsx`
- Modify: `src/components/vocab/GameSession.tsx`

- [ ] **Step 1: ChoiceQuestion shows an example once answered**

Add imports:

```ts
import type { Example } from '../../lib/examples'
import ExampleSentence from './ExampleSentence'
```

Add `/** Shown once answered (leeches). */ example?: Example | null` to `ChoiceQuestionProps`, `example = null,` to the destructuring, and inside `QuestionCard`, after the `{listen && !answered ? (…) : (…)}` expression:

```tsx
        {answered && example && (
          <ExampleSentence example={example} className='mt-4 vocab-rise-in' />
        )}
```

- [ ] **Step 2: Rewrite GameSession.tsx**

```tsx
import { useEffect, useState } from 'react'
import { isLeech, schedule } from '../../lib/srs'
import { buildQueue, getSrsState, rateCard, useSrs } from '../../lib/srsStore'
import { gradeFor, makeQuestion } from '../../lib/quiz'
import type { Question, QuestionKind } from '../../lib/quiz'
import type { SrsState } from '../../lib/srsStore'
import type { Episode } from '../../types'
import { canSpeak } from '../../lib/speech'
import { episodeIdsOf, exampleOf, useExamples } from '../../lib/examples'
import ChoiceQuestion from './ChoiceQuestion'
import ClozeQuestion from './ClozeQuestion'
import DictationQuestion from './DictationQuestion'
import SessionHeader from './SessionHeader'
import SessionSummary from './SessionSummary'
import type { SessionStats } from './SessionSummary'
import SpellQuestion from './SpellQuestion'

// As in StudySession: a card still learning comes back after a few others.
const REQUEUE_GAP = 3

// Answered by typing, so the keyboard hint differs.
const TYPED_KINDS: QuestionKind[] = ['spell', 'cloze', 'dictation']

/**
 * The head of `queue` with its question. Cards nothing can be asked about (see
 * quiz.makeQuestion) are dropped from this game; flashcards still cover them.
 */
interface Round {
  queue: string[]
  question: Question | null
  recent: QuestionKind[]
}

function nextRound(srs: SrsState, queue: string[], recent: QuestionKind[]): Round {
  const pool = Object.values(srs.cards)
  let rest = queue
  while (rest.length) {
    const card = srs.cards[rest[0]]
    const question = card
      ? makeQuestion(card, pool, recent, { canSpeak, hasExample: exampleOf(card) !== null })
      : null
    if (question) return { queue: rest, question, recent }
    rest = rest.slice(1)
  }
  return { queue: rest, question: null, recent }
}

export interface SessionProps {
  episodeId: number | null
  episode: Episode | undefined
  onExit: () => void
}

export default function GameSession({ episodeId, episode, onExit }: SessionProps) {
  const srs = useSrs()
  // Which kinds a card can be asked depends on its example sentence, so the
  // first question waits for the examples of the session's episodes.
  const [start] = useState(() => {
    const queue = buildQueue(srs, Date.now(), episodeId)
    return { queue, episodeIds: episodeIdsOf(queue.map((id) => srs.cards[id])) }
  })
  const examplesReady = useExamples(start.episodeIds)
  const [round, setRound] = useState<Round | null>(null)
  if (examplesReady && round === null) setRound(nextRound(srs, start.queue, []))
  // Bumped on every answer: it keys the question so the same card twice in a
  // row still remounts fresh.
  const [turn, setTurn] = useState(0)
  const [stats, setStats] = useState<SessionStats>(() => ({
    startedAt: Date.now(),
    answers: 0,
    forgotten: 0,
    learned: 0,
  }))

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onExit()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onExit])

  if (!round) {
    return <p className='py-24 text-center text-sm text-zinc-500'>Đang chuẩn bị…</p>
  }

  const { queue, question, recent } = round
  const card = question ? srs.cards[queue[0]] : null

  const answer = (result: Parameters<typeof gradeFor>[0]) => {
    if (!card || !question) return
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

  if (!card || !question) {
    return <SessionSummary stats={stats} onExit={onExit} />
  }

  const example = exampleOf(card)
  // Words forgotten again and again get their sentence whatever the question.
  const extra = isLeech(card) ? example : null

  return (
    <div className='min-h-full flex flex-col max-w-xl mx-auto px-4'>
      <SessionHeader queue={queue} cards={srs.cards} answers={stats.answers} onExit={onExit} />

      {episode && (
        <p className='text-center text-xs font-medium text-zinc-500 dark:text-zinc-400'>
          Bài {episode.id} · {episode.title}
        </p>
      )}

      <div className='flex-1 flex flex-col justify-center py-6'>
        {question.kind === 'cloze' && example ? (
          <ClozeQuestion key={turn} card={card} example={example} onDone={answer} />
        ) : question.kind === 'dictation' && example ? (
          <DictationQuestion key={turn} card={card} example={example} onDone={answer} />
        ) : question.kind === 'meaning' || question.kind === 'listen' ? (
          <ChoiceQuestion
            key={turn}
            card={card}
            kind={question.kind}
            options={question.options}
            answerIndex={question.answerIndex}
            autoSpeak={srs.settings.autoSpeak}
            example={extra}
            onDone={answer}
          />
        ) : (
          <SpellQuestion key={turn} card={card} example={extra} onDone={answer} />
        )}
      </div>

      <p className='pb-8 text-center text-xs text-zinc-400 hidden sm:block'>
        {TYPED_KINDS.includes(question.kind)
          ? 'Enter để kiểm tra · Esc để thoát'
          : 'Phím 1–4 để chọn · Enter để tiếp · Esc để thoát'}
      </p>
    </div>
  )
}
```

Note: `exampleOf(card)` is only read after `examplesReady` turned `round` non-null, and `round` is state, so the render depends on it (see the `useExamples` doc).

- [ ] **Step 3: Check**

Run: `npm run format && npm run typecheck && npm run lint && node scripts/verify_quiz.js`
Expected: all pass.

- [ ] **Step 4: Drive all five kinds**

With at least some complete example rows built into `public/vocab` (Task 5, or the temporary trick from Task 10 Step 3 on episode 1), `npm run dev`, then in DevTools set card states to reach each stage and play `#vocab/play/1`:

```js
s = JSON.parse(localStorage.englishpod_srs_v1)
Object.values(s.cards).forEach((c, i) => {
  c.state = ['new', 'learning', 'review', 'review'][i % 4]
  c.interval = [0, 0, 5, 30][i % 4]
  c.due = Date.now() - 1000
  if (i === 3) c.lapses = 4
})
localStorage.englishpod_srs_v1 = JSON.stringify(s)
location.reload()
```

Check: new cards get Chọn nghĩa/Nghe; learning cards also Điền từ; bud cards get Nghe/Điền từ/Cloze; bloom cards get Cloze/Chép chính tả. Cloze: blank in the sentence, cells sized to the inflected word, hint/retry work, sentence + translation shown after. Dictation: sentence is read on show, 🐢 reads slowly, Enter checks, words coloured, Tiếp focused, Enter continues. A leech card shows its example after any kind. Narrow screen (375px) has no horizontal scroll. Esc exits.

- [ ] **Step 5: Commit**

```bash
git add src/components/vocab/ChoiceQuestion.tsx src/components/vocab/GameSession.tsx
git commit -m "feat: games ask cloze and dictation by garden stage, leeches show their sentence

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Daily new-word cap (client)

**Files:**
- Modify: `src/lib/srsStore.ts`
- Modify: `src/components/vocab/VocabHome.tsx`
- Create: `scripts/verify_srs_store.js`

- [ ] **Step 1: Write the failing check `scripts/verify_srs_store.js`**

```js
/**
 * Checks srsStore's pure selectors that the new-word cap touches
 * (newCardsLeft, buildQueue, summarize) on a hand-built state.
 *
 * Usage:
 *   node scripts/verify_srs_store.js
 */

// srsStore reads localStorage when it loads; give Node an empty one.
globalThis.localStorage = { getItem: () => null, setItem: () => {} };

const { buildQueue, newCardsLeft, summarize } = await import('../src/lib/srsStore.ts');
const { dayKey } = await import('../src/lib/srs.ts');

const problems = [];
const expect = (name, got, want) => {
    if (JSON.stringify(got) !== JSON.stringify(want)) {
        problems.push(`${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
    }
};

const now = new Date(2026, 9, 6, 12).getTime();
const card = (id, patch) => ({
    id, word: id, ipa: '', type: '', def: '', vi: id, viDef: '', episodeIds: [1], state: 'new',
    step: 0, ease: 2.5, interval: 0, due: now, reps: 0, lapses: 0, addedAt: now, lastReview: null,
    updatedAt: now, ...patch,
});
const cards = {};
for (let i = 0; i < 6; i++) cards[`new${i}`] = card(`new${i}`, { addedAt: now + i });
cards.due0 = card('due0', { state: 'review', interval: 3, due: now - 1000 });
const state = (newPerDay, learned) => ({
    cards, decks: [1], deckMeta: {}, settings: { autoSpeak: true, lastEpisodeId: null, newPerDay },
    settingsUpdatedAt: 0, days: { [dayKey(now)]: { reviews: learned, learned } },
    tombstones: { cards: {}, decks: {} }, pendingLogs: [], resetAt: null,
});

expect('left, cap 4, 1 learned', newCardsLeft(state(4, 1), now), 3);
expect('left, cap 4, 9 learned', newCardsLeft(state(4, 9), now), 0);
expect('left, no cap', newCardsLeft(state(null, 9), now), Infinity);
expect('queue, cap 4, 1 learned', buildQueue(state(4, 1), now), ['due0', 'new0', 'new1', 'new2']);
expect('queue, cap reached', buildQueue(state(4, 4), now), ['due0']);
expect('queue, one episode ignores the cap', buildQueue(state(4, 4), now, 1).length, 7);
expect('summary freshToday', summarize(state(4, 1), now).freshToday, 3);
expect('summary seed unchanged', summarize(state(4, 1), now).seed, 6);
expect('episode summary freshToday', summarize(state(4, 4), now, 1).freshToday, 6);

if (problems.length) {
    console.log(`${problems.length} problem(s):`);
    for (const p of problems) console.log(`  - ${p}`);
    process.exit(1);
}
console.log('All srs store checks passed.');
```

Run: `node scripts/verify_srs_store.js; echo "exit $?"`
Expected: fails — `newCardsLeft` is not exported.

- [ ] **Step 2: srsStore changes**

Value imports with extensions, so Node can load the file (as in quiz.ts):

```ts
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
```

`Settings`:

```ts
export interface Settings {
  autoSpeak: boolean
  lastEpisodeId: number | null
  /** New cards a day when studying the whole garden; null = no limit. */
  newPerDay: number | null
}
```

`Summary`:

```ts
/** Per stage, plus what is due, what can be studied ahead, and how many new cards today allows. */
export type Summary = Record<Stage | 'total' | 'due' | 'ahead' | 'freshToday', number>
```

`DEFAULT_STATE.settings`: `{ autoSpeak: true, lastEpisodeId: null, newPerDay: 15 },`

In `applySyncResult`, replace

```ts
        const { autoSpeak, lastEpisodeId } = changes.settings
        settings = { ...settings, autoSpeak, lastEpisodeId }
```

with

```ts
        const { autoSpeak, lastEpisodeId } = changes.settings
        // A server from before the cap sends no newPerDay: keep the default.
        const newPerDay =
          'newPerDay' in changes.settings
            ? changes.settings.newPerDay
            : DEFAULT_STATE.settings.newPerDay
        settings = { ...settings, autoSpeak, lastEpisodeId, newPerDay }
```

Add before `summarize`:

```ts
/** New cards today still allows when studying the whole garden. */
export function newCardsLeft(s: SrsState, now: number): number {
  const limit = s.settings.newPerDay
  if (limit === null) return Infinity
  return Math.max(0, limit - (s.days[dayKey(now)]?.learned ?? 0))
}
```

`summarize`: initialise `freshToday: 0` in `counts`, and before `return counts` add:

```ts
  // One episode's study is a deliberate choice and is not capped (see buildQueue).
  counts.freshToday =
    episodeId === null ? Math.min(counts.seed, newCardsLeft(s, now)) : counts.seed
```

`buildQueue`: change the doc's `There is no daily cap on new cards.` to `Across the whole garden, new cards stop at the daily cap (settings.newPerDay); one episode's session takes all of its new cards.` and replace the `fresh` line with:

```ts
  const fresh = inScope
    .filter((c) => c.state === 'new')
    .sort((a, b) => a.addedAt - b.addedAt)
    .slice(0, episodeId === null ? newCardsLeft(s, now) : Infinity)
```

Run: `node scripts/verify_srs_store.js`
Expected: `All srs store checks passed.`

- [ ] **Step 3: VocabHome**

Imports: add `Sprout` to the lucide import, `useId` to the react import (`import { useId, useState } from 'react'`).

Add below `PLAY_NEEDS`:

```ts
// The choices for Từ mới mỗi ngày; null is no limit.
const NEW_PER_DAY_CHOICES = [5, 10, 15, 20, 30, null]
```

In `VocabHome`: `const goal = doneToday + overall.due + overall.freshToday`, and pass to `TodayCard`:

```tsx
            fresh={overall.freshToday}
            capReached={overall.seed > overall.freshToday}
            newPerDay={srs.settings.newPerDay}
```

(replacing `fresh={overall.seed}`).

`TodayCardProps`: add `capReached: boolean` and `newPerDay: number | null`; destructure both. Replace the subtitle `<p className='text-sm opacity-90'>…</p>` contents with:

```tsx
          <p className='text-sm opacity-90'>
            {[
              hasWork && `${due} từ cần ôn`,
              fresh > 0 && `${fresh} từ mới`,
              capReached && `đã đủ ${newPerDay} từ mới hôm nay`,
              !hasWork &&
                (nextDue !== null
                  ? `lượt ôn tiếp theo sau ${formatDelay(nextDue)} · vẫn có thể ôn thêm ${ahead} từ`
                  : !capReached && 'thêm bộ từ để có từ mới.'),
            ]
              .filter(Boolean)
              .join(' · ')
              .replace(/^./, (c) => c.toUpperCase())}
          </p>
```

`Settings` component: add `const newPerDayId = useId()` at the top, and after the auto-speak `<button>` (inside the same divided container) add:

```tsx
        <div className='p-4 flex items-center justify-between gap-3'>
          <label htmlFor={newPerDayId} className='flex items-center gap-3'>
            <Sprout size={18} />
            <span className='font-medium'>Từ mới mỗi ngày</span>
          </label>
          <select
            id={newPerDayId}
            value={settings.newPerDay ?? ''}
            onChange={(e) =>
              updateSettings({ newPerDay: e.target.value ? Number(e.target.value) : null })
            }
            className='px-3 py-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-sm font-semibold outline-none focus:ring-2 focus:ring-rose-300'
          >
            {NEW_PER_DAY_CHOICES.map((n) => (
              <option key={n ?? 'all'} value={n ?? ''}>
                {n ?? 'Không giới hạn'}
              </option>
            ))}
          </select>
        </div>
```

- [ ] **Step 4: Check and drive**

Run: `npm run format && npm run typecheck && npm run lint && node scripts/verify_srs_store.js && node scripts/verify_quiz.js`
Expected: all pass.

Drive: with a deck of 20+ new words, set "Từ mới mỗi ngày" to 5: the today card says "5 từ mới"; study 5 new words; the card then reads "… · đã đủ 5 từ mới hôm nay" and a new whole-garden session holds no new card; the episode's own Học button still offers all its new words. Reload: the setting persists.

- [ ] **Step 5: Commit**

```bash
git add src/lib/srsStore.ts src/components/vocab/VocabHome.tsx scripts/verify_srs_store.js
git commit -m "feat: cap new words a day when studying the whole garden

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: Sync `newPerDay` (server)

**Files:**
- Modify: `server/prisma/schema.prisma`
- Create: `server/prisma/migrations/20261006000000_new_per_day/migration.sql`
- Modify: `server/src/sync/schema.ts`, `server/src/sync/wire.ts`, `server/src/sync/service.ts`, `server/scripts/smoke.ts`

All commands in `server/` with pnpm: `cd server && source ~/.nvm/nvm.sh && nvm use 22.18.0 >/dev/null && …`.

- [ ] **Step 1: Failing smoke check**

In `server/scripts/smoke.ts`, replace the `'settings sync across devices'` check with:

```ts
await check('settings sync across devices', async () => {
  await sync(A, { settings: { autoSpeak: false, lastEpisodeId: 7, newPerDay: null, updatedAt: 6000 } })
  const res = await sync(B)
  assert.deepEqual(res.changes.settings, {
    autoSpeak: false,
    lastEpisodeId: 7,
    newPerDay: null,
    updatedAt: 6000,
  })
})

await check('settings from a client without newPerDay get the default cap', async () => {
  await sync(A, { settings: { autoSpeak: true, lastEpisodeId: 7, updatedAt: 6500 } })
  const res = await sync(B)
  assert.equal(res.changes.settings?.newPerDay, 15)
})
```

- [ ] **Step 2: Schema and migration**

`schema.prisma`, model `Settings`, after `lastEpisodeId`:

```prisma
  newPerDay     Int?    @default(15) @map("new_per_day")
```

`server/prisma/migrations/20261006000000_new_per_day/migration.sql`:

```sql
-- New words a day when studying the whole garden (null = no limit).
ALTER TABLE "settings" ADD COLUMN "new_per_day" INTEGER DEFAULT 15;
```

- [ ] **Step 3: zod, wire, service**

`schema.ts`, in `settingsSchema` after `lastEpisodeId`:

```ts
  // Clients from before the cap do not send it.
  newPerDay: z.number().int().min(1).max(999).nullable().default(15),
```

`wire.ts`, `toWireSettings`:

```ts
export function toWireSettings(s: Settings): WireSettings {
  return {
    autoSpeak: s.autoSpeak,
    lastEpisodeId: s.lastEpisodeId,
    newPerDay: s.newPerDay,
    updatedAt: num(s.updatedAt),
  }
}
```

`service.ts`, `upsertSettings`:

```ts
async function upsertSettings(tx: Tx, userId: string, settings: NonNullable<SyncChanges['settings']>) {
  await tx.$executeRaw`
    INSERT INTO settings AS s (user_id, auto_speak, last_episode_id, new_per_day, updated_at, rev)
    VALUES (${userId}::uuid, ${settings.autoSpeak}, ${settings.lastEpisodeId}, ${settings.newPerDay},
      ${settings.updatedAt}, nextval('sync_rev'))
    ON CONFLICT (user_id) DO UPDATE SET
      auto_speak = EXCLUDED.auto_speak, last_episode_id = EXCLUDED.last_episode_id,
      new_per_day = EXCLUDED.new_per_day, updated_at = EXCLUDED.updated_at, rev = EXCLUDED.rev
    WHERE s.updated_at < EXCLUDED.updated_at`
}
```

- [ ] **Step 4: Apply and run**

Run: `pnpm prisma migrate deploy && pnpm typecheck && pnpm smoke`
Expected: migration `20261006000000_new_per_day` applied to the dev DB in `.env`; typecheck passes; smoke prints every check passing, including the two settings checks. If the DB in `.env` is unreachable, run only `pnpm typecheck`, and report that smoke could not run.

- [ ] **Step 5: Commit**

```bash
git add server/prisma server/src/sync server/scripts/smoke.ts
git commit -m "feat: sync the daily new-word cap

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Deployment note for the user (no CI deploys the server): run `pnpm prisma migrate deploy` on the production DB **before** deploying the new server build. The client works against the old server (it keeps the default 15 when `newPerDay` is absent).

---

### Task 16: Leech filter in the word list

**Files:** Modify `src/components/vocab/WordList.tsx`

- [ ] **Step 1: Filter and badge**

Imports: add `isLeech` to the `../../lib/srs` import, `import LeechBadge from './LeechBadge'`.

```ts
type FilterKey = 'all' | 'learned' | 'leech' | Stage
```

Append to `FILTERS` (after the `'seed'` entry): `{ key: 'leech', label: 'Hay quên' },`

Add below `SORTERS`:

```ts
function matches(card: StoredCard, key: FilterKey): boolean {
  if (key === 'all') return true
  if (key === 'learned') return card.state !== 'new'
  if (key === 'leech') return isLeech(card)
  return stageOf(card) === key
}
```

Replace `countOf` with `const countOf = (key: FilterKey) => all.filter((c) => matches(c, key)).length` and the first `.filter(…)` in `words` with `.filter((c) => matches(c, filter))`.

Empty message: replace `: 'Chưa có từ nào ở mục này.'` with

```tsx
                : filter === 'leech'
                  ? 'Không có từ nào hay quên 🎉'
                  : 'Chưa có từ nào ở mục này.'
```

In `WordRow`, after the IPA span inside `<p className='truncate'>`, add:

```tsx
              {isLeech(card) && <LeechBadge className='ml-2 align-middle px-2! py-0.5! text-[11px]!' />}
```

- [ ] **Step 2: Check, drive, commit**

Run: `npm run format && npm run typecheck && npm run lint`
Drive: with a card at `lapses: 4` (DevTools trick from Task 10), `#vocab/words/leech` lists exactly it with the badge; the chip count matches.

```bash
git add src/components/vocab/WordList.tsx
git commit -m "feat: Hay quên filter and badge in the word list

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 17: Final verification

- [ ] **Step 1: All checks**

Run:

```bash
node scripts/verify_examples.js && node scripts/verify_quiz.js && node scripts/verify_srs_store.js \
  && node scripts/verify_vocab.js && npm run typecheck && npm run lint && npm run format:check && npm run build
```

Expected: every script prints its "passed" line; build succeeds. (If Task 5 is not finished yet, `verify_examples.js` fails only with "must all be filled in" — report how many rows remain with `--summary`.)

- [ ] **Step 2: Drive the whole flow** (skill `run`): fresh profile (clear localStorage) → add episode 1 → study with flashcards (example on the back) → play (seed kinds) → set states via DevTools as in Task 13 → play all five kinds → leech filter → new-word cap → 375px width for flashcard, cloze and dictation. Note anything off and fix before finishing.

- [ ] **Step 3: Hand off** with superpowers:finishing-a-development-branch.

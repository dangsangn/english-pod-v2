/**
 * The Top 1000 data (see docs/superpowers/specs/2026-10-08-core-1000-words-design.md):
 * NGSL 1.2 as the source of lemmas, the tokenizer that counts them in the
 * dialogues, and the hand-authored rows in scripts/data/core-vi/NN.jsonl —
 * one file per group of 100, ordered by rank:
 *
 *   {"rank","w","n","ex","hit","ep"?,"exVi","d","vi","vd","syn","col","colHint"}
 *
 * `col` is [{ en, vi }]; `colHint` only helps whoever writes `col` and is never built.
 *
 * Shared by rank_core.js, build_core.js and verify_core.js.
 */

import fs from 'fs';
import path from 'path';
import { ROOT } from './transcripts.js';
import { plain } from './examples.js';

export const NGSL_DIR = path.join(ROOT, 'scripts/data/ngsl');
export const CORE_DIR = path.join(ROOT, 'scripts/data/core-vi');
export const CORE_OUT_DIR = path.join(ROOT, 'public/core');
export const CORE_GROUPS = 10;
export const CORE_GROUP_SIZE = 100;
export const CORE_SIZE = CORE_GROUPS * CORE_GROUP_SIZE;

/** "03.jsonl" for group 3 (ranks 201–300). */
export const coreFileForGroup = (group) => `${String(group).padStart(2, '0')}.jsonl`;
/** The file a row of rank `rank` lives in. */
export const coreFileFor = (rank) => coreFileForGroup(Math.ceil(rank / CORE_GROUP_SIZE));
/** "core_03.json": what the app fetches for group 3 (src/lib/coreDecks.ts vocabFile). */
export const coreOutFor = (group) => `core_${String(group).padStart(2, '0')}.json`;

const readLines = (file) => fs.readFileSync(path.join(NGSL_DIR, file), 'utf-8').split(/\r?\n/);

/** NGSL 1.2 by rank: [{ lemma, rank, forms }], `forms` including the lemma itself, all lower case. */
export function loadNgsl() {
    const forms = new Map();
    for (const line of readLines('NGSL_12_lemmatized_for_teaching.csv')) {
        if (!line.trim() || line.startsWith('##')) continue;
        const [lemma, ...rest] = line.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
        forms.set(lemma, [lemma, ...rest]);
    }
    return readLines('NGSL_12_stats.csv')
        .slice(1)
        .filter((line) => line.trim())
        .map((line) => {
            const [lemma, rank] = line.split(',');
            const key = lemma.trim().toLowerCase();
            return { lemma: key, rank: Number(rank), forms: forms.get(key) ?? [key] };
        })
        .sort((a, b) => a.rank - b.rank);
}

export function loadFunctionWords() {
    const { words } = JSON.parse(fs.readFileSync(path.join(NGSL_DIR, 'function-words.json'), 'utf-8'));
    return new Set(words.map((w) => w.toLowerCase()));
}

/**
 * The words of `text` as written, for counting: letters with at most one
 * inner apostrophe. Negated auxiliaries ("don't", "won't", "isn't") are
 * skipped — they are all function words, and "won't" must not count as "win".
 * Other apostrophes keep the part before them: "Dad's" → "Dad", "I'm" → "I".
 */
export function wordTokens(text) {
    const out = [];
    for (const m of plain(text).matchAll(/[A-Za-z]+(?:'[A-Za-z]+)?/g)) {
        if (/n't$/i.test(m[0])) continue;
        out.push(m[0].split("'")[0]);
    }
    return out;
}

export function listCoreFiles() {
    if (!fs.existsSync(CORE_DIR)) return [];
    return fs.readdirSync(CORE_DIR).filter((f) => f.endsWith('.jsonl')).sort();
}

/** Every row of `files`, with where it came from. Throws on a line that is not JSON. */
export function readCoreRows(files = listCoreFiles()) {
    const rows = [];
    for (const file of files) {
        const full = path.join(CORE_DIR, file);
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

export function writeCoreFile(file, rows) {
    fs.mkdirSync(CORE_DIR, { recursive: true });
    fs.writeFileSync(path.join(CORE_DIR, file), rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
}

/** Ready to ship: meaning, Vietnamese, and an example holding the word with its translation. */
export function isCoreComplete(row) {
    return Boolean(
        row.d && row.vi && row.vd && row.ex && row.hit && row.exVi && row.ex.includes(row.hit),
    );
}

/** A row as the app reads it (src/types.ts VocabEntry). */
export function toCoreEntry(row, ipa) {
    return {
        word: row.w,
        ipa,
        def: row.d,
        vi: row.vi,
        viDef: row.vd,
        ex: row.ex,
        exHit: row.hit,
        exVi: row.exVi,
        ...(row.syn?.length ? { syn: row.syn } : {}),
        ...(row.col?.length ? { col: row.col } : {}),
        ...(row.ep ? { exEp: row.ep } : {}),
    };
}

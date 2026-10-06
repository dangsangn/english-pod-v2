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

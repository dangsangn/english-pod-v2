/**
 * Ranks the 1000 most common content words of conversation and drafts them
 * into scripts/data/core-vi/NN.jsonl (see
 * docs/superpowers/specs/2026-10-08-core-1000-words-design.md).
 *
 * Candidates are the NGSL 1.2 lemmas minus function-words.json. Each gets
 * score = ngslRank / N + epRank / N, where epRank is its place by how often
 * its forms occur in the 365 dialogues (unseen words all rank N). The 1000
 * lowest scores are kept, in that order.
 *
 * Each word gets the dialogue sentence that best shows it: one whose whole
 * line is already translated in dialogue-vi (so the Vietnamese comes free),
 * then one of 5–15 words, then the shortest. Vietnamese is prefilled from
 * vocab-vi when an episode already taught the same word in a single sense.
 *
 * `colHint` lists the five commonest 2–4 word runs around the word in the
 * dialogues (seen at least 3 times, not starting or ending in a function word
 * other than a particle like "out"), as "make sure (41)". It is recomputed on
 * every run and only guides whoever writes `col`.
 *
 * Safe to re-run: the authored fields of a word already drafted (d, vi, vd,
 * syn, col, and its example once set) are kept; only rank, n and the grouping
 * move. Rows that fall out of the top 1000 are printed and saved to
 * scripts/.cache/core-dropped.jsonl.
 *
 * Usage:
 *   node scripts/rank_core.js
 */

import fs from 'fs';
import path from 'path';
import { cardId } from '../src/lib/srs.ts';
import { loadTranslations } from './build_vocab.js';
import { readDialogueRows } from './lib/dialogue.js';
import { plain, splitSentences } from './lib/examples.js';
import { LAST_EPISODE, ROOT, readDialogueLines } from './lib/transcripts.js';
import {
    CORE_GROUPS, CORE_GROUP_SIZE, CORE_SIZE, coreFileForGroup, loadFunctionWords, loadNgsl,
    readCoreRows, wordTokens, writeCoreFile,
} from './lib/core.js';

/** Whether example `a` shows its word better than `b`. Ties keep `b`, the earlier episode. */
function isBetter(a, b) {
    if (!b) return true;
    if (Boolean(a.exVi) !== Boolean(b.exVi)) return Boolean(a.exVi);
    if (a.good !== b.good) return a.good;
    return a.ex.length < b.ex.length;
}

function main() {
    const functionWords = loadFunctionWords();
    const candidates = loadNgsl().filter((w) => !functionWords.has(w.lemma));
    const N = candidates.length;
    const ngslRank = new Map(candidates.map((w, i) => [w.lemma, i + 1]));
    // A form shared by two lemmas ("found") counts for the more common one.
    const headOf = new Map();
    for (const w of candidates) {
        for (const form of w.forms) if (!headOf.has(form)) headOf.set(form, w.lemma);
    }

    const lines = [];
    for (let ep = 1; ep <= LAST_EPISODE; ep++) {
        for (const text of readDialogueLines(ep)) lines.push({ ep, text });
    }

    const count = new Map();
    for (const { text } of lines) {
        for (const token of wordTokens(text)) {
            const head = headOf.get(token.toLowerCase());
            if (head) count.set(head, (count.get(head) ?? 0) + 1);
        }
    }

    // Stable sort: equal counts keep NGSL order.
    const byCount = [...candidates].sort((a, b) => (count.get(b.lemma) ?? 0) - (count.get(a.lemma) ?? 0));
    const epRank = new Map(byCount.map((w, i) => [w.lemma, count.get(w.lemma) ? i + 1 : N]));
    const score = (lemma) => ngslRank.get(lemma) / N + epRank.get(lemma) / N;
    const top = candidates
        .map((w) => w.lemma)
        .sort((a, b) => score(a) - score(b) || ngslRank.get(a) - ngslRank.get(b))
        .slice(0, CORE_SIZE);
    const inTop = new Set(top);

    // Example sentences.
    const viOfLine = new Map();
    for (const { row } of readDialogueRows()) viOfLine.set(`${row.ep}\u0000${plain(row.en)}`, row.vi);
    const best = new Map();
    for (const { ep, text } of lines) {
        const sentences = splitSentences(text);
        // A line cut into sentences no longer matches its translation.
        const exVi = sentences.length === 1 ? (viOfLine.get(`${ep}\u0000${plain(text)}`) ?? '') : '';
        for (const ex of sentences) {
            const words = ex.split(' ').length;
            for (const hit of wordTokens(ex)) {
                const head = headOf.get(hit.toLowerCase());
                if (!head || !inTop.has(head)) continue;
                const found = { ex, hit, ep, exVi, good: words >= 5 && words <= 15 };
                if (isBetter(found, best.get(head))) best.set(head, found);
            }
        }
    }

    // Collocation hints: every 2–4 word run holding an occurrence of the word.
    const PARTICLES = new Set(['up', 'out', 'off', 'down', 'over', 'back', 'away', 'on', 'in', 'about', 'around']);
    const isEdgeFunction = (token) =>
        /n't$/.test(token) || (functionWords.has(token.split("'")[0]) && !PARTICLES.has(token));
    const phrases = new Map();
    for (const { text } of lines) {
        for (const sentence of splitSentences(text)) {
            const seenInSentence = new Map();
            const tokens = plain(sentence).toLowerCase().match(/[a-z]+(?:'[a-z]+)?/g) ?? [];
            tokens.forEach((token, i) => {
                if (/n't$/.test(token)) return;
                const head = headOf.get(token.split("'")[0]);
                if (!head || !inTop.has(head)) return;
                const counts = phrases.get(head) ?? new Map();
                phrases.set(head, counts);
                const once = seenInSentence.get(head) ?? new Set();
                seenInSentence.set(head, once);
                for (let n = 2; n <= 4; n++) {
                    for (let start = Math.max(0, i - n + 1); start <= i && start + n <= tokens.length; start++) {
                        const run = tokens.slice(start, start + n);
                        if (isEdgeFunction(run[0]) || isEdgeFunction(run[n - 1])) continue;
                        const phrase = run.join(' ');
                        if (once.has(phrase)) continue;
                        once.add(phrase);
                        counts.set(phrase, (counts.get(phrase) ?? 0) + 1);
                    }
                }
            });
        }
    }
    const colHint = (lemma) =>
        [...(phrases.get(lemma) ?? new Map())]
            .filter(([, c]) => c >= 3)
            .sort(([a, x], [b, y]) => y - x || b.split(' ').length - a.split(' ').length)
            .slice(0, 5)
            .map(([phrase, c]) => `${phrase} (${c})`);

    // Vietnamese already written for the same word in an episode's vocabulary.
    const prefill = new Map();
    const senses = new Map();
    for (const [key, t] of loadTranslations().map) {
        const word = key.split('\u0000')[0];
        const list = senses.get(word) ?? [];
        list.push(t);
        senses.set(word, list);
    }
    for (const [word, list] of senses) if (list.length === 1) prefill.set(word, list[0]);

    const existing = new Map(readCoreRows().map(({ row }) => [cardId(row.w), row]));
    let prefilled = 0;
    const rows = top.map((lemma, i) => {
        const old = existing.get(lemma);
        const example = old?.ex ? old : best.get(lemma);
        const t = prefill.get(lemma);
        if (!old && t) prefilled++;
        return {
            rank: i + 1,
            w: lemma,
            n: count.get(lemma) ?? 0,
            ex: example?.ex ?? '',
            hit: example?.hit ?? '',
            ep: example?.ep,
            exVi: example?.exVi ?? '',
            d: old?.d ?? '',
            vi: old?.vi ?? t?.vi ?? '',
            vd: old?.vd ?? t?.viDef ?? '',
            syn: old?.syn ?? [],
            col: old?.col ?? [],
            colHint: colHint(lemma),
        };
    });

    for (let g = 1; g <= CORE_GROUPS; g++) {
        writeCoreFile(coreFileForGroup(g), rows.slice((g - 1) * CORE_GROUP_SIZE, g * CORE_GROUP_SIZE));
    }

    const dropped = [...existing.values()].filter((row) => !inTop.has(cardId(row.w)));
    if (dropped.length) {
        const file = path.join(ROOT, 'scripts/.cache/core-dropped.jsonl');
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, dropped.map((r) => JSON.stringify(r)).join('\n') + '\n');
        console.log(`Dropped from the top ${CORE_SIZE}: ${dropped.map((r) => r.w).join(', ')}`);
        console.log(`  saved to ${path.relative(ROOT, file)}`);
    }

    console.log(`NGSL content words: ${N}; dialogue lines: ${lines.length}`);
    console.log(`Top 30: ${rows.slice(0, 30).map((r) => `${r.w}(${r.n})`).join(' ')}`);
    console.log(`Never in a dialogue: ${rows.filter((r) => r.n === 0).length}`);
    console.log(`Without an example: ${rows.filter((r) => !r.ex).length}`);
    console.log(`Example still needing Vietnamese: ${rows.filter((r) => r.ex && !r.exVi).length}`);
    console.log(`Prefilled from vocab-vi: ${prefilled}`);
    console.log(`With collocation hints: ${rows.filter((r) => r.colHint.length).length}`);
}

main();

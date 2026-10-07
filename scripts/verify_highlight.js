/**
 * Checks src/lib/highlightVocab.findHits against every episode: each word whose
 * example sentence was taken from an episode's dialogue (scripts/data/vocab-ex,
 * src "dialogue") is found in that episode's dialogue, and every hit covers
 * exactly the word's text (ignoring whitespace and curly apostrophes, as the
 * matcher does).
 *
 * Usage:
 *   node scripts/verify_highlight.js
 */

import fs from 'fs';
import path from 'path';
import { LAST_EPISODE, ROOT, readDialogue } from './lib/transcripts.js';
import { readExampleRows } from './lib/examples.js';
import { findHits } from '../src/lib/highlightVocab.ts';

const squash = (t) => t.replace(/\s+/g, '').replace(/[’‘ʼ]/g, "'");
const vocabOf = (ep) => {
    const file = path.join(ROOT, 'public/vocab', `englishpod_${String(ep).padStart(4, '0')}.json`);
    return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf-8')) : [];
};

const problems = [];
let hits = 0;
let dropped = 0;
let episodes = 0;

// The words whose sentence comes from each episode's dialogue.
const fromDialogue = new Map();
for (const { row } of readExampleRows()) {
    if (row.src !== 'dialogue') continue;
    if (!fromDialogue.has(row.ep)) fromDialogue.set(row.ep, []);
    fromDialogue.get(row.ep).push(row);
}

for (let ep = 1; ep <= LAST_EPISODE; ep++) {
    const entries = vocabOf(ep);
    const lines = readDialogue(ep).map((l) => l.text);
    if (!entries.length || !lines.length) continue;
    episodes++;

    for (const row of fromDialogue.get(ep) ?? []) {
        const entry = entries.find((e) => e.word === row.w && e.ex === row.ex);
        if (!entry) {
            problems.push(`episode ${ep} "${row.w}": no vocab entry carries this sentence (rebuild vocab?)`);
            continue;
        }
        if (!lines.some((line) => findHits(line, [entry]).length)) {
            problems.push(`episode ${ep} "${row.w}": not found in the dialogue`);
        }
    }

    for (const line of lines) {
        const found = findHits(line, entries);
        const alone = entries.reduce((n, e) => n + findHits(line, [e]).length, 0);
        dropped += alone - found.length;
        for (const hit of found) {
            hits++;
            const text = line.slice(hit.start, hit.end);
            if (squash(text) !== squash(hit.entry.exHit)) {
                problems.push(`episode ${ep} "${hit.entry.word}": hit "${text}" is not "${hit.entry.exHit}"`);
            }
            if (!squash(line).includes(squash(hit.entry.ex))) {
                problems.push(`episode ${ep} "${hit.entry.word}": hit is in a line without its sentence`);
            }
            if (/^\s|\s$/.test(text)) {
                problems.push(`episode ${ep} "${hit.entry.word}": hit "${text}" has whitespace at an edge`);
            }
        }
        for (let i = 1; i < found.length; i++) {
            if (found[i].start < found[i - 1].end) problems.push(`episode ${ep}: overlapping hits in "${line}"`);
        }
    }
}

if (problems.length) {
    console.log(`${problems.length} problem(s):`);
    for (const p of problems.slice(0, 50)) console.log(`  - ${p}`);
    process.exit(1);
}
console.log(
    `All highlight checks passed: ${hits} hits in ${episodes} episodes (${dropped} dropped as overlapping).`,
);

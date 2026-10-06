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

// Fragments like "GMAT?" make poor cloze/dictation sentences.
const MIN_GOOD_WORDS = 5;
const wordCount = (s) => s.split(' ').length;

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
            const good = wordCount(sentence) >= MIN_GOOD_WORDS;
            const better =
                !best ||
                (found.exact && !best.exact) ||
                (found.exact === best.exact &&
                    (good && !best.good || (good === best.good && sentence.length < best.ex.length)));
            if (better) best = { ex: sentence, hit: found.hit, exact: found.exact, good, ep };
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

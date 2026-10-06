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
    // Transcripts sometimes glue words together ("wantyou"), so ignore whitespace when matching:
    // a dialogue sentence may add the spaces the transcript lost, but not change any other character.
    const squash = (t) => t.replace(/\s+/g, '');
    if (row.src === 'dialogue' && !linesOf(row.ep).some((l) => squash(l).includes(squash(row.ex)))) {
        fail(where, `sentence is not in episode ${row.ep}'s dialogue (ignoring spaces)`);
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

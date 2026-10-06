/**
 * Checks scripts/data/dialogue-vi/*.jsonl against the transcripts: every line
 * has exactly one row, its English still matches, and it has a translation.
 *
 * Usage:
 *   node scripts/verify_dialogue.js              # every file, fails on any problem
 *   node scripts/verify_dialogue.js --file=0003  # one file
 *   node scripts/verify_dialogue.js --summary    # untranslated lines per file; never fails
 */

import { dialogueFileFor, lineKey, listDialogueFiles, readDialogueRows } from './lib/dialogue.js';
import { LAST_EPISODE, readDialogue } from './lib/transcripts.js';

const only = process.argv.find((a) => a.startsWith('--file='))?.slice('--file='.length);
const summary = process.argv.includes('--summary');
const files = only ? [`${only}.jsonl`] : listDialogueFiles();
const rows = readDialogueRows(files);

if (summary) {
    const byFile = new Map();
    for (const { row, file } of rows) {
        const s = byFile.get(file) ?? { rows: 0, done: 0 };
        s.rows++;
        if (row.vi) s.done++;
        byFile.set(file, s);
    }
    let left = 0;
    for (const [file, s] of byFile) {
        left += s.rows - s.done;
        console.log(`${file}  ${s.done}/${s.rows} translated`);
    }
    console.log(`\n${left} lines untranslated`);
    process.exit(0);
}

const lines = new Map();
for (let ep = 1; ep <= LAST_EPISODE; ep++) {
    if (only && dialogueFileFor(ep) !== files[0]) continue;
    for (const line of readDialogue(ep)) lines.set(lineKey(ep, line.index), { ep, ...line });
}

const problems = [];
const fail = (where, message) => problems.push(`${where}: ${message}`);
const seen = new Set();

for (const { row, file, line } of rows) {
    const where = `${file}:${line} (ep ${row.ep} line ${row.i})`;
    const key = lineKey(row.ep, row.i);
    const source = lines.get(key);
    if (!source) {
        fail(where, 'no such dialogue line');
        continue;
    }
    if (seen.has(key)) {
        fail(where, 'duplicate row');
        continue;
    }
    seen.add(key);
    if (dialogueFileFor(row.ep) !== file) fail(where, `belongs in ${dialogueFileFor(row.ep)}`);
    if (row.en !== source.text) fail(where, 'the English no longer matches the transcript');
    if (typeof row.vi !== 'string' || !row.vi.trim()) fail(where, 'vi is empty');
    else if (row.vi !== row.vi.trim() || /\s{2,}/.test(row.vi)) fail(where, 'vi has stray spaces');
}
for (const [key, source] of lines) {
    if (!seen.has(key)) fail(dialogueFileFor(source.ep), `missing a row for ep ${source.ep} line ${source.index}`);
}

console.log(`${rows.length} rows in ${files.length} file(s), ${lines.size} dialogue lines`);
if (problems.length) {
    console.log(`\n${problems.length} problem(s):`);
    for (const p of problems.slice(0, 80)) console.log(`  - ${p}`);
    if (problems.length > 80) console.log(`  … and ${problems.length - 80} more`);
    process.exit(1);
}
console.log('All dialogue checks passed.');

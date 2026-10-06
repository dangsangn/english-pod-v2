/**
 * Drafts scripts/data/dialogue-vi/*.jsonl: one row per dialogue line with an
 * empty `vi` to write. A row whose line is unchanged keeps its translation, so
 * this is safe to re-run while the translations are being written.
 *
 * Usage:
 *   node scripts/extract_dialogue.js
 */

import { dialogueFileFor, lineKey, readDialogueRows, writeDialogueFile } from './lib/dialogue.js';
import { LAST_EPISODE, readDialogue } from './lib/transcripts.js';

const existing = new Map(readDialogueRows().map(({ row }) => [lineKey(row.ep, row.i), row]));
const files = new Map();
let kept = 0;
let drafted = 0;

for (let ep = 1; ep <= LAST_EPISODE; ep++) {
    for (const { index, speaker, text } of readDialogue(ep)) {
        const old = existing.get(lineKey(ep, index));
        const row =
            old && old.en === text && old.vi ? old : { ep, i: index, s: speaker, en: text, vi: '' };
        if (row === old) kept++;
        else drafted++;
        const file = dialogueFileFor(ep);
        if (!files.has(file)) files.set(file, []);
        files.get(file).push(row);
    }
}

for (const [file, rows] of files) writeDialogueFile(file, rows);
console.log(`${files.size} files written: kept ${kept} translated lines, drafted ${drafted}`);

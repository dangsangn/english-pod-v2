/**
 * Builds public/dialogue/englishpod_NNNN.json: the Vietnamese for each dialogue
 * line of an episode, as an array indexed like the page's
 * `.dialogue-block .text` elements. A line without a translation (or whose
 * English no longer matches the transcript) is an empty string, and the app
 * shows no translate button for it.
 *
 * Usage:
 *   node scripts/build_dialogue.js
 */

import fs from 'fs';
import path from 'path';
import { DIALOGUE_OUT_DIR, lineKey, readDialogueRows } from './lib/dialogue.js';
import { LAST_EPISODE, readDialogue } from './lib/transcripts.js';

const rows = new Map(readDialogueRows().map(({ row }) => [lineKey(row.ep, row.i), row]));
fs.mkdirSync(DIALOGUE_OUT_DIR, { recursive: true });

let written = 0;
let lines = 0;
let translated = 0;
for (let ep = 1; ep <= LAST_EPISODE; ep++) {
    const dialogue = readDialogue(ep);
    const out = path.join(DIALOGUE_OUT_DIR, `englishpod_${String(ep).padStart(4, '0')}.json`);
    const vi = dialogue.map(({ index, text }) => {
        const row = rows.get(lineKey(ep, index));
        return row && row.en === text ? row.vi || '' : '';
    });
    lines += vi.length;
    translated += vi.filter(Boolean).length;
    // No translated line: no file, so the app simply shows no buttons.
    if (!vi.some(Boolean)) {
        if (fs.existsSync(out)) fs.unlinkSync(out);
        continue;
    }
    fs.writeFileSync(out, `${JSON.stringify(vi)}\n`);
    written++;
}

console.log(`Dialogue: ${translated}/${lines} lines translated, ${written} episode files written`);

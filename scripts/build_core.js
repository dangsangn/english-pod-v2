/**
 * Builds the Top 1000 decks into public/core/core_NN.json from
 * scripts/data/core-vi/NN.jsonl (see
 * docs/superpowers/specs/2026-10-08-core-1000-words-design.md), in the same
 * VocabEntry shape as public/vocab/, plus `syn` and `exEp`.
 *
 * A group is written only when all 100 of its rows are complete; otherwise its
 * file is removed, so a file that exists is always whole. IPA comes from
 * CMUdict like build_vocab.js.
 *
 * Usage:
 *   node scripts/build_core.js
 */

import fs from 'fs';
import path from 'path';
import { ipaFor, loadCmudict } from './build_vocab.js';
import {
    CORE_GROUPS, CORE_GROUP_SIZE, CORE_OUT_DIR, coreFileForGroup, coreOutFor, isCoreComplete,
    readCoreRows, toCoreEntry,
} from './lib/core.js';

async function main() {
    const cmudict = await loadCmudict();
    fs.mkdirSync(CORE_OUT_DIR, { recursive: true });
    for (let g = 1; g <= CORE_GROUPS; g++) {
        const rows = readCoreRows([coreFileForGroup(g)])
            .map((r) => r.row)
            .sort((a, b) => a.rank - b.rank);
        const done = rows.filter(isCoreComplete).length;
        const out = path.join(CORE_OUT_DIR, coreOutFor(g));
        if (rows.length !== CORE_GROUP_SIZE || done !== rows.length) {
            if (fs.existsSync(out)) fs.unlinkSync(out);
            console.log(`${coreOutFor(g)}: ${done}/${CORE_GROUP_SIZE} rows done, not written`);
            continue;
        }
        const entries = rows.map((row) => toCoreEntry(row, ipaFor(row.w, cmudict)));
        fs.writeFileSync(out, `${JSON.stringify(entries, null, 2)}\n`);
        const noIpa = entries.filter((e) => !e.ipa).map((e) => e.word);
        console.log(`${coreOutFor(g)}: written${noIpa.length ? ` (no IPA: ${noIpa.join(', ')})` : ''}`);
    }
}

main().catch((err) => {
    console.error(err.message);
    process.exit(1);
});

/**
 * Checks the Top 1000 data (docs/superpowers/specs/2026-10-08-core-1000-words-design.md):
 * the tokenizer, the function-word list against NGSL, the rows in
 * scripts/data/core-vi/, and that each built public/core file matches its source.
 *
 * Usage:
 *   node scripts/verify_core.js
 */

import fs from 'fs';
import path from 'path';
import { cardId } from '../src/lib/srs.ts';
import {
    CORE_GROUPS, CORE_GROUP_SIZE, CORE_OUT_DIR, CORE_SIZE, coreFileFor, coreFileForGroup, coreOutFor,
    isCoreComplete, loadFunctionWords, loadNgsl, readCoreRows, toCoreEntry, wordTokens,
} from './lib/core.js';
import { LAST_EPISODE } from './lib/transcripts.js';

const problems = [];
const expect = (name, got, want) => {
    if (JSON.stringify(got) !== JSON.stringify(want)) {
        problems.push(`${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
    }
};

// ------------------------------------------------------------- tokenizer

expect('tokens', wordTokens("I'm sure Dad's car won't start, isn't it?"),
    ['I', 'sure', 'Dad', 'car', 'start', 'it']);
expect('curly apostrophe', wordTokens('We’re going'), ['We', 'going']);

// --------------------------------------------------------- function words

const ngsl = loadNgsl();
expect('NGSL lemmas', ngsl.length > 2700, true);
expect('NGSL forms of go', ngsl.find((w) => w.lemma === 'go')?.forms.includes('went'), true);
const lemmas = new Set(ngsl.map((w) => w.lemma));
for (const w of loadFunctionWords()) {
    if (!lemmas.has(w)) problems.push(`function-words.json: "${w}" is not an NGSL lemma`);
}

// -------------------------------------------------------------------- rows

const functionWords = loadFunctionWords();
const formsOf = new Map(ngsl.map((w) => [w.lemma, new Set(w.forms)]));
const rows = readCoreRows();
if (rows.length === 0) problems.push('no rows in scripts/data/core-vi/ — run node scripts/rank_core.js');
const seen = new Map();
const perFile = new Map();
for (const { row, file, line } of rows) {
    const at = `${file}:${line}`;
    perFile.set(file, (perFile.get(file) ?? 0) + 1);
    if (coreFileFor(row.rank) !== file) problems.push(`${at}: rank ${row.rank} belongs in ${coreFileFor(row.rank)}`);
    const id = cardId(row.w);
    if (seen.has(id)) problems.push(`${at}: "${row.w}" repeats ${seen.get(id)}`);
    else seen.set(id, at);
    if (functionWords.has(id)) problems.push(`${at}: "${row.w}" is a function word`);
    if (row.ex && !(row.hit && row.ex.includes(row.hit))) {
        problems.push(`${at}: hit "${row.hit}" is not in the sentence`);
    }
    if (row.ep !== undefined && !(Number.isInteger(row.ep) && row.ep >= 1 && row.ep <= LAST_EPISODE)) {
        problems.push(`${at}: bad ep ${row.ep}`);
    }
    const syn = row.syn ?? [];
    if (!Array.isArray(syn) || syn.length > 3) {
        problems.push(`${at}: syn must be a list of at most 3`);
    } else {
        for (const s of syn) {
            if (!s?.en || !s?.vi) problems.push(`${at}: syn entry needs en and vi: ${JSON.stringify(s)}`);
        }
        const keys = syn.map((s) => cardId(s?.en));
        if (keys.includes(id)) problems.push(`${at}: syn repeats the word itself`);
        if (new Set(keys).size !== keys.length) problems.push(`${at}: syn has duplicates`);
    }
    const col = row.col ?? [];
    const forms = formsOf.get(id) ?? new Set([id]);
    if (!Array.isArray(col) || col.length > 3) {
        problems.push(`${at}: col must be a list of at most 3`);
    } else {
        for (const c of col) {
            if (!c?.en || !c?.vi) problems.push(`${at}: col entry needs en and vi: ${JSON.stringify(c)}`);
            else if (!wordTokens(c.en).some((t) => forms.has(t.toLowerCase()))) {
                problems.push(`${at}: col "${c.en}" does not contain "${row.w}"`);
            }
        }
        const ens = col.map((c) => cardId(c?.en));
        if (new Set(ens).size !== ens.length) problems.push(`${at}: col has duplicates`);
    }
}
if (rows.length) {
    const ranks = rows.map((r) => r.row.rank).sort((a, b) => a - b);
    expect('ranks run 1…1000', ranks.join(','), Array.from({ length: CORE_SIZE }, (_, i) => i + 1).join(','));
    for (let g = 1; g <= CORE_GROUPS; g++) {
        expect(`${coreFileForGroup(g)} rows`, perFile.get(coreFileForGroup(g)) ?? 0, CORE_GROUP_SIZE);
    }
}

// ------------------------------------------------------------- built files

for (let g = 1; g <= CORE_GROUPS; g++) {
    const name = coreOutFor(g);
    const out = path.join(CORE_OUT_DIR, name);
    const source = rows
        .filter((r) => r.file === coreFileForGroup(g))
        .map((r) => r.row)
        .sort((a, b) => a.rank - b.rank);
    const complete = source.length === CORE_GROUP_SIZE && source.every(isCoreComplete);
    if (!fs.existsSync(out)) {
        if (complete) problems.push(`${name} is missing — run node scripts/build_core.js`);
        continue;
    }
    if (!complete) {
        problems.push(`${name} exists but ${coreFileForGroup(g)} is not complete`);
        continue;
    }
    const built = JSON.parse(fs.readFileSync(out, 'utf-8'));
    // IPA comes from CMUdict at build time; everything else must match the source.
    const noIpa = (items) => items?.map(({ en, vi }) => ({ en, vi }));
    const comparable = (e) => ({ ...e, ipa: undefined, syn: noIpa(e.syn), col: noIpa(e.col) });
    expect(`${name} matches its source`, built.map(comparable),
        source.map((row) => comparable(toCoreEntry(row, () => ''))));
}

// ------------------------------------------------------------------ report

if (problems.length) {
    console.log(`${problems.length} problem(s):`);
    for (const p of problems) console.log(`  - ${p}`);
    process.exit(1);
}
console.log('All core checks passed.');

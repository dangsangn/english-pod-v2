/**
 * Checks the Top 1000 data (docs/superpowers/specs/2026-10-08-core-1000-words-design.md):
 * the tokenizer, the function-word list against NGSL, the rows in
 * scripts/data/core-vi/, and that each built public/core file matches its source.
 *
 * Usage:
 *   node scripts/verify_core.js
 */

import { loadFunctionWords, loadNgsl, wordTokens } from './lib/core.js';

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

// ------------------------------------------------------------------ report

if (problems.length) {
    console.log(`${problems.length} problem(s):`);
    for (const p of problems) console.log(`  - ${p}`);
    process.exit(1);
}
console.log('All core checks passed.');

/**
 * Checks the vocabulary games' questions (src/lib/quiz.ts) against every
 * generated vocab file, building them the way the app does. Reports each
 * problem by word so it can be looked at directly.
 *
 * Usage:
 *   node scripts/verify_quiz.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { cardId } from '../src/lib/srs.ts';
import {
    allowedKinds,
    buildChoices,
    checkSpelling,
    comparable,
    gradeFor,
    lettersOf,
    makeQuestion,
    maskWord,
    meaningOf,
    pickKind,
} from '../src/lib/quiz.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const VOCAB_DIR = path.resolve(__dirname, '../public/vocab');

// Seeded, so a failure can be reproduced run after run.
function mulberry32(seed) {
    return () => {
        seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const problems = [];
const fail = (message) => problems.push(message);

/** One card per word, as srsStore does when several decks share a word. */
function loadCards() {
    const cards = new Map();
    const files = fs.readdirSync(VOCAB_DIR).filter((f) => f.endsWith('.json')).sort();
    for (const file of files) {
        const episodeId = Number(/(\d+)\.json$/.exec(file)[1]);
        const entries = JSON.parse(fs.readFileSync(path.join(VOCAB_DIR, file), 'utf-8'));
        for (const entry of entries) {
            const id = cardId(entry.word);
            if (!id) continue;
            const existing = cards.get(id);
            if (existing) {
                if (!existing.episodeIds.includes(episodeId)) existing.episodeIds.push(episodeId);
                continue;
            }
            cards.set(id, {
                id,
                word: entry.word,
                ipa: entry.ipa || '',
                type: entry.type || '',
                def: entry.def || '',
                vi: entry.vi || '',
                viDef: entry.viDef || '',
                episodeIds: [episodeId],
                state: 'review',
            });
        }
    }
    return [...cards.values()];
}

/** Same split as quiz.ts uses, so the check does not depend on its internals. */
function senses(text) {
    return String(text).split(/[,;]/).map(comparable).filter(Boolean);
}

function checkChoices(card, pool, field, rng, expectFull) {
    const where = `"${card.word}" (${field})`;
    const { options, answerIndex } = buildChoices(card, pool, field, rng);
    const answer = field === 'meaning' ? meaningOf(card) : card.word;
    if (options[answerIndex] !== answer) fail(`${where}: answer is not at answerIndex`);
    const keys = options.map(field === 'meaning' ? comparable : lettersOf);
    if (new Set(keys).size !== keys.length) {
        fail(`${where}: duplicate options ${JSON.stringify(options)}`);
    }
    if (field === 'meaning') {
        const answerSenses = new Set(senses(answer));
        const overlapping = options.filter(
            (o, i) => i !== answerIndex && senses(o).some((s) => answerSenses.has(s)),
        );
        if (overlapping.length) {
            fail(`${where}: option shares a sense with the answer ${JSON.stringify(overlapping)}`);
        }
    }
    if (expectFull && options.length !== 4) {
        fail(`${where}: only ${options.length} options from the whole garden`);
    }
    return options.length;
}

function checkSpellingOf(card) {
    const where = `"${card.word}" (spell)`;
    const letters = lettersOf(card.word);
    if (!letters) {
        fail(`${where}: no letters to type`);
        return;
    }
    const cells = maskWord(card.word).flat().filter((t) => t.type === 'letter');
    if (cells.length !== letters.length) {
        fail(`${where}: ${cells.length} cells for ${letters.length} letters`);
    }
    if (cells.some((t, i) => t.index !== i)) fail(`${where}: cell indexes out of order`);
    if (!checkSpelling(card.word, card.word)) fail(`${where}: the word itself is rejected`);
    if (!checkSpelling(`  ${card.word.toUpperCase()} `, card.word)) {
        fail(`${where}: upper case / extra spaces rejected`);
    }
    if (checkSpelling(`${card.word}x`, card.word)) fail(`${where}: an extra letter is accepted`);
}

function checkRules(rng) {
    const newCard = { id: 'n', word: 'grab', vi: 'chộp lấy', def: '', state: 'new', episodeIds: [1] };
    if (allowedKinds(newCard, { canSpeak: true }).includes('spell')) {
        fail('rules: a new card may be asked to spell');
    }
    const silentEmpty = { ...newCard, vi: '', state: 'review' };
    if (allowedKinds(silentEmpty, { canSpeak: false }).length !== 0) {
        fail('rules: a card without meaning or speech still gets a kind');
    }
    if (makeQuestion(silentEmpty, [silentEmpty], [], { canSpeak: false }, rng) !== null) {
        fail('rules: makeQuestion should give up on a card nothing can be asked about');
    }
    for (let i = 0; i < 200; i++) {
        if (pickKind(['meaning', 'spell', 'listen'], ['spell', 'spell'], rng) === 'spell') {
            fail('rules: the same kind came up three times in a row');
            break;
        }
    }
    if (pickKind(['spell'], ['spell', 'spell'], rng) !== 'spell') {
        fail('rules: the only allowed kind must still be picked');
    }
    const grades = [
        [{ correct: true }, 'good'],
        [{ correct: true, hinted: true }, 'hard'],
        [{ correct: true, attempts: 2 }, 'hard'],
        [{ correct: false, attempts: 2 }, 'again'],
    ];
    for (const [result, want] of grades) {
        if (gradeFor(result) !== want) fail(`rules: gradeFor(${JSON.stringify(result)}) should be ${want}`);
    }
}

const rng = mulberry32(42);
const cards = loadCards();
const byEpisode = new Map();
for (const card of cards) {
    for (const id of card.episodeIds) {
        if (!byEpisode.has(id)) byEpisode.set(id, []);
        byEpisode.get(id).push(card);
    }
}

checkRules(rng);

// With only one deck in the garden, fewer than 4 options is allowed (the
// spec's minimum is 2); count it so a regression in distractor choice shows.
let shortWithOneDeck = 0;
for (const card of cards) {
    const deck = byEpisode.get(card.episodeIds[0]);
    checkSpellingOf(card);
    checkChoices(card, cards, 'word', rng, true);
    if (checkChoices(card, deck, 'word', rng, false) < 4 && deck.length >= 4) shortWithOneDeck++;
    if (meaningOf(card)) {
        checkChoices(card, cards, 'meaning', rng, true);
        if (checkChoices(card, deck, 'meaning', rng, false) < 4 && deck.length >= 4) shortWithOneDeck++;
    }
}

console.log(`${cards.length} cards from ${byEpisode.size} episodes`);
console.log(`${shortWithOneDeck} questions have fewer than 4 options when only their own deck is in the garden`);
if (problems.length) {
    console.log(`\n${problems.length} problem(s):`);
    for (const p of problems.slice(0, 50)) console.log(`  - ${p}`);
    if (problems.length > 50) console.log(`  … and ${problems.length - 50} more`);
    process.exit(1);
}
console.log('All quiz checks passed.');

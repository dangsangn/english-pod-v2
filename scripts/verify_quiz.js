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
import { cardId, isLeech } from '../src/lib/srs.ts';
import {
    allowedKinds,
    buildChoices,
    checkSpelling,
    comparable,
    gradeDictation,
    gradeFor,
    hitIndex,
    hitRanges,
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
                interval: 1,
                lapses: 0,
                example: entry.ex ? { ex: entry.ex, hit: entry.exHit, vi: entry.exVi } : null,
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

function checkTargetWords(where, ex, hit) {
    // A possessive target ("groom's" for the hit "groom") is fine, so compare without a trailing 's.
    const bare = (text) => text.split(' ').map((w) => w.replace(/['’]s$/i, '')).join(' ');
    const targets = gradeDictation(ex, ex, hit)
        .words.filter((w) => w.target)
        .map((w) => w.text)
        .join(' ');
    if (comparable(bare(targets)) !== comparable(bare(hit))) {
        fail(`${where}: dictation marks "${targets}" as the target, want "${hit}"`);
    }
}

function checkExampleOf(card) {
    const { example } = card;
    if (!example) return;
    const where = `"${card.word}" (example)`;
    if (!example.ex.includes(example.hit)) fail(`${where}: hit is not in the sentence`);
    if (!lettersOf(example.hit)) fail(`${where}: cloze has no letters to type`);
    if (!checkSpelling(example.hit, example.hit)) fail(`${where}: cloze rejects its own answer`);
    const full = gradeDictation(example.ex, example.ex, example.hit);
    if (!full.targetCorrect || full.accuracy !== 1) {
        fail(`${where}: dictation of the sentence itself is not fully right`);
    }
    if (!full.words.some((w) => w.target)) fail(`${where}: dictation finds no target word`);
    checkTargetWords(where, example.ex, example.hit);
    if (gradeDictation('', example.ex, example.hit).targetCorrect) {
        fail(`${where}: an empty dictation counts as right`);
    }
}

function checkRules(rng) {
    const newCard = { id: 'n', word: 'grab', vi: 'chộp lấy', def: '', state: 'new', interval: 0, lapses: 0, episodeIds: [1] };
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
    const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
    const card = { ...newCard, lapses: 0 };
    const stages = [
        ['seed', { state: 'new', interval: 0 }, true, true, ['meaning', 'listen']],
        ['sprout', { state: 'learning', interval: 0 }, true, true, ['meaning', 'listen', 'spell']],
        ['bud', { state: 'review', interval: 5 }, true, true, ['listen', 'spell', 'cloze']],
        ['bloom', { state: 'review', interval: 30 }, true, true, ['cloze', 'dictation']],
        ['bloom, no example', { state: 'review', interval: 30 }, true, false, ['listen', 'spell']],
        ['bloom, no speech', { state: 'review', interval: 30 }, false, true, ['cloze']],
        ['relearning', { state: 'relearning', interval: 30 }, true, true, ['meaning', 'listen', 'spell']],
    ];
    for (const [name, patch, canSpeak, hasExample, want] of stages) {
        const got = allowedKinds({ ...card, ...patch }, { canSpeak, hasExample });
        if (!same(got, want)) fail(`rules: ${name} allows ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
    }
    const bloom = { ...card, state: 'review', interval: 30 };
    for (let i = 0; i < 50; i++) {
        const q = makeQuestion(bloom, [bloom], [], { canSpeak: true, hasExample: true }, rng);
        if (!q || (q.kind !== 'cloze' && q.kind !== 'dictation')) {
            fail(`rules: a bloom card got ${q?.kind}`);
            break;
        }
    }

    const sentence = "I'll go with the spaghetti.";
    const dictation = [
        ["I'll go with the spaghetti", true, 1],
        ['I’ll go with the spaghetti', true, 1],
        ['ill go with spaghetti', true, 3 / 5],
        ["I'll go the spaghetti", false, 4 / 5],
        ["I'll go with the the spaghetti", true, 1],
    ];
    for (const [input, targetCorrect, accuracy] of dictation) {
        const got = gradeDictation(input, sentence, 'go with');
        if (got.targetCorrect !== targetCorrect || Math.abs(got.accuracy - accuracy) > 1e-9) {
            fail(
                `rules: gradeDictation(${JSON.stringify(input)}) = ${got.targetCorrect}/${got.accuracy}, ` +
                    `want ${targetCorrect}/${accuracy}`,
            );
        }
    }
    const extra = gradeDictation("I'll go with the the spaghetti", sentence, 'go with');
    if (extra.words.filter((w) => w.status === 'extra').length !== 1) {
        fail('rules: a repeated word should show as one extra');
    }

    if (hitIndex('I said go ago, go now', 'go') !== 7) fail('rules: hitIndex should skip "go" inside "ago"');
    if (hitIndex('going', 'go') !== 0) fail('rules: hitIndex should fall back to a plain match');
    if (hitIndex('abc', 'x') !== -1) fail('rules: hitIndex of a missing word is -1');
    if (JSON.stringify(hitRanges('Right on, right on!', 'right on')) !== '[[0,8],[10,18]]') {
        fail('rules: hitRanges should find every whole-word occurrence, ignoring case');
    }
    if (JSON.stringify(hitRanges('I said go ago, go now', 'go')) !== '[[7,9],[15,17]]') {
        fail('rules: hitRanges should skip "go" inside "ago"');
    }
    if (JSON.stringify(hitRanges('going', 'go')) !== '[[0,2]]') fail('rules: hitRanges should fall back to a plain match');
    if (hitRanges('abc', 'x').length !== 0) fail('rules: hitRanges of a missing word is empty');
    checkTargetWords('rules: pot', 'Put the potatoes in a big pot of water.', 'pot');
    const ago = gradeDictation('ago go', 'ago go', 'go');
    if (ago.words.map((w) => w.target).join() !== 'false,true') {
        fail('rules: gradeDictation should mark only the whole word "go" as the target');
    }

    if (isLeech({ lapses: 3 }) || !isLeech({ lapses: 4 })) fail('rules: a leech is 4 or more lapses');
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
    checkExampleOf(card);
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

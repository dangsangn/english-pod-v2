/**
 * Checks the Top 1000 decks in the app's code: deck ids and file names
 * (coreDecks.ts), adding and removing a core deck next to an episode deck
 * (srsStore.ts), and the example and synonym lookup (examples.ts) — with
 * fetch serving fake vocabulary files.
 *
 * Usage:
 *   node scripts/verify_core_decks.js
 */

// srsStore reads localStorage when it loads; give Node an empty one.
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
const files = new Map();
globalThis.fetch = async (url) =>
    files.has(url)
        ? { ok: true, status: 200, json: async () => files.get(url) }
        : { ok: false, status: 404, json: async () => null };

const { CORE_DECK_IDS, coreDeckName, isCoreDeck, vocabFile } = await import('../src/lib/coreDecks.ts');
const { addDeckById, getSrsState, markLesson, rateCard, removeDeck } = await import('../src/lib/srsStore.ts');
const { collocationsOf, exampleOf, loadExamples, synonymsOf } = await import('../src/lib/examples.ts');

const problems = [];
const expect = (name, got, want) => {
    if (JSON.stringify(got) !== JSON.stringify(want)) {
        problems.push(`${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
    }
};

expect('ids', CORE_DECK_IDS, [10001, 10002, 10003, 10004, 10005, 10006, 10007, 10008, 10009, 10010]);
expect('episode is not core', isCoreDeck(365), false);
expect('first group is core', isCoreDeck(10001), true);
expect('past the last group', isCoreDeck(10011), false);
expect('name', coreDeckName(10002), 'Top 1000 · 101–200');
expect('episode file', vocabFile(42), './vocab/englishpod_0042.json');
expect('core file', vocabFile(10010), './core/core_10.json');

files.set('./vocab/englishpod_0001.json', [
    { word: 'buy', def: 'pay for', vi: 'mua', ex: 'I want to buy it.', exHit: 'buy', exVi: 'Tôi muốn mua nó.' },
    { word: 'grab', def: 'get quickly', vi: 'chộp' },
]);
files.set('./core/core_01.json', [
    { word: 'buy', def: 'get by paying', vi: 'mua', ex: 'Buy one.', exHit: 'Buy', exVi: 'Mua một cái.', exEp: 42, syn: [{ en: 'purchase', vi: 'mua sắm', ipa: 'ˈpɝtʃəs' }, { en: 'get', vi: 'mua' }], col: [{ en: 'buy time', vi: 'câu giờ' }] },
    { word: 'go', def: 'move', vi: 'đi', ex: 'Let us go.', exHit: 'go', exVi: 'Đi nào.', syn: [{ en: 'leave', vi: 'rời đi' }] },
]);

await addDeckById(1);
rateCard('buy', 'good', Date.now());
const before = getSrsState().cards.buy;
await addDeckById(10001);
let s = getSrsState();
for (const k of ['state', 'step', 'ease', 'interval', 'due', 'reps', 'lapses', 'addedAt', 'lastReview']) {
    expect(`progress survives: ${k}`, s.cards.buy[k], before[k]);
}
expect('reviewed card has progress', before.reps > 0, true);
expect('the content change is stamped', s.cards.buy.updatedAt >= before.updatedAt, true);
expect('decks', s.decks, [1, 10001]);
expect('a shared word is one card in both decks', s.cards.buy.episodeIds, [1, 10001]);
expect('the shared card takes the Top 1000 content', s.cards.buy.def, 'get by paying');
markLesson(10001, 'preview');
expect('no lesson progress for a core deck', getSrsState().lessons[10001], undefined);
expect('a core-only card', s.cards.go.episodeIds, [10001]);
let threw = false;
try {
    await addDeckById(10002);
} catch {
    threw = true;
}
expect('a group not built yet throws', threw, true);
expect('and adds nothing', getSrsState().decks, [1, 10001]);

await loadExamples([1, 10001]);
expect('example from the first deck that has one', exampleOf(s.cards.buy),
    { ex: 'I want to buy it.', hit: 'buy', vi: 'Tôi muốn mua nó.' });
expect('a core example carries its episode', exampleOf({ id: 'buy', episodeIds: [10001] }),
    { ex: 'Buy one.', hit: 'Buy', vi: 'Mua một cái.', ep: 42 });
expect('synonyms from the deck that has them', synonymsOf(s.cards.buy),
    [{ en: 'purchase', vi: 'mua sắm', ipa: 'ˈpɝtʃəs' }, { en: 'get', vi: 'mua' }]);
expect('no synonyms', synonymsOf(s.cards.grab), []);
expect('collocations', collocationsOf(s.cards.buy), [{ en: 'buy time', vi: 'câu giờ' }]);
expect('synonyms without collocations', collocationsOf(s.cards.go), []);

files.set('./vocab/englishpod_0002.json', [{ word: 'go', def: 'leave', vi: 'rời đi' }]);
await addDeckById(2);
s = getSrsState();
expect('an episode deck keeps the core content', s.cards.go.def, 'move');
expect('and links the episode', s.cards.go.episodeIds, [10001, 2]);

removeDeck(10001);
s = getSrsState();
expect('removing the core deck keeps the shared card', s.cards.buy?.episodeIds, [1]);
expect('and drops the cards only it had', s.cards.grab?.episodeIds, [1]);
expect('a card kept by another deck keeps its content', [s.cards.go.episodeIds, s.cards.go.def], [[2], 'move']);

if (problems.length) {
    console.log(`${problems.length} problem(s):`);
    for (const p of problems) console.log(`  - ${p}`);
    process.exit(1);
}
console.log('All core deck checks passed.');

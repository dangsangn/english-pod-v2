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
const { addDeckById, getSrsState, removeDeck } = await import('../src/lib/srsStore.ts');
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
    { word: 'buy', def: 'get by paying', vi: 'mua', ex: 'Buy one.', exHit: 'Buy', exVi: 'Mua một cái.', exEp: 42, syn: ['purchase', 'get'], col: [{ en: 'buy time', vi: 'câu giờ' }] },
    { word: 'go', def: 'move', vi: 'đi', ex: 'Let us go.', exHit: 'go', exVi: 'Đi nào.', syn: ['leave'] },
]);

await addDeckById(1);
await addDeckById(10001);
let s = getSrsState();
expect('decks', s.decks, [1, 10001]);
expect('a shared word is one card in both decks', s.cards.buy.episodeIds, [1, 10001]);
expect('the shared card keeps its first content', s.cards.buy.def, 'pay for');
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
expect('synonyms from the deck that has them', synonymsOf(s.cards.buy), ['purchase', 'get']);
expect('no synonyms', synonymsOf(s.cards.grab), []);
expect('collocations', collocationsOf(s.cards.buy), [{ en: 'buy time', vi: 'câu giờ' }]);
expect('synonyms without collocations', collocationsOf(s.cards.go), []);

removeDeck(10001);
s = getSrsState();
expect('removing the core deck keeps the shared card', s.cards.buy?.episodeIds, [1]);
expect('and drops its own cards', s.cards.go, undefined);

if (problems.length) {
    console.log(`${problems.length} problem(s):`);
    for (const p of problems) console.log(`  - ${p}`);
    process.exit(1);
}
console.log('All core deck checks passed.');

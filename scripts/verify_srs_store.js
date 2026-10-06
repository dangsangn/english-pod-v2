/**
 * Checks srsStore's pure selectors that the new-word cap touches
 * (newCardsLeft, buildQueue, summarize) on a hand-built state.
 *
 * Usage:
 *   node scripts/verify_srs_store.js
 */

// srsStore reads localStorage when it loads; give Node an empty one.
globalThis.localStorage = { getItem: () => null, setItem: () => {} };

const { buildQueue, newCardsLeft, summarize } = await import('../src/lib/srsStore.ts');
const { dayKey } = await import('../src/lib/srs.ts');

const problems = [];
const expect = (name, got, want) => {
    if (JSON.stringify(got) !== JSON.stringify(want)) {
        problems.push(`${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
    }
};

const now = new Date(2026, 9, 6, 12).getTime();
const card = (id, patch) => ({
    id, word: id, ipa: '', type: '', def: '', vi: id, viDef: '', episodeIds: [1], state: 'new',
    step: 0, ease: 2.5, interval: 0, due: now, reps: 0, lapses: 0, addedAt: now, lastReview: null,
    updatedAt: now, ...patch,
});
const cards = {};
for (let i = 0; i < 6; i++) cards[`new${i}`] = card(`new${i}`, { addedAt: now + i });
cards.due0 = card('due0', { state: 'review', interval: 3, due: now - 1000 });
const state = (newPerDay, learned) => ({
    cards, decks: [1], deckMeta: {}, settings: { autoSpeak: true, lastEpisodeId: null, newPerDay },
    settingsUpdatedAt: 0, days: { [dayKey(now)]: { reviews: learned, learned } },
    tombstones: { cards: {}, decks: {} }, pendingLogs: [], resetAt: null,
});

expect('left, cap 4, 1 learned', newCardsLeft(state(4, 1), now), 3);
expect('left, cap 4, 9 learned', newCardsLeft(state(4, 9), now), 0);
expect('left, no cap', newCardsLeft(state(null, 9), now), Infinity);
expect('queue, cap 4, 1 learned', buildQueue(state(4, 1), now), ['due0', 'new0', 'new1', 'new2']);
expect('queue, cap reached', buildQueue(state(4, 4), now), ['due0']);
expect('queue, one episode ignores the cap', buildQueue(state(4, 4), now, 1).length, 7);
expect('summary freshToday', summarize(state(4, 1), now).freshToday, 3);
expect('summary seed unchanged', summarize(state(4, 1), now).seed, 6);
expect('episode summary freshToday', summarize(state(4, 4), now, 1).freshToday, 6);

if (problems.length) {
    console.log(`${problems.length} problem(s):`);
    for (const p of problems) console.log(`  - ${p}`);
    process.exit(1);
}
console.log('All srs store checks passed.');

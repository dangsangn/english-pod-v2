/**
 * Checks srsStore's pure selectors that the new-word cap touches
 * (newCardsLeft, buildQueue, summarize) on a hand-built state, and the lesson
 * loop: its pure helpers and its round trip through the store and a sync.
 *
 * Usage:
 *   node scripts/verify_srs_store.js
 */

// srsStore reads localStorage when it loads; give Node an empty one.
globalThis.localStorage = { getItem: () => null, setItem: () => {} };

const {
    applySyncResult, buildQueue, collectSrsChanges, getSrsState, listenStepAfter, listenedTo,
    markLesson, mergeLesson, newCardsLeft, nextLessonStep, summarize,
} = await import('../src/lib/srsStore.ts');
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
    tombstones: { cards: {}, decks: {} }, pendingLogs: [], resetAt: null, lessons: {},
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

// Lesson loop: pure helpers.
expect('merge takes the later of each step',
    mergeLesson({ preview: 5, listen: 9 }, { preview: 7, review: 3 }, null),
    { preview: 7, listen: 9, review: 3 });
expect('merge drops steps before a reset', mergeLesson({ preview: 5, listen: 9 }, undefined, 6), { listen: 9 });
expect('merge of nothing', mergeLesson(undefined, undefined, null), {});
expect('next step, fresh episode', nextLessonStep(undefined), 'preview');
expect('next step skips done ones', nextLessonStep({ preview: 1, review: 2 }), 'listen');
expect('next step, loop done', nextLessonStep({ preview: 1, listen: 2, review: 3, relisten: 4 }), null);
expect('ended: first listen', listenStepAfter({ preview: 1 }), 'listen');
expect('ended: after the review', listenStepAfter({ listen: 1, review: 2 }), 'relisten');
expect('ended: listened, not reviewed yet', listenStepAfter({ listen: 1 }), null);
expect('ended: loop done', listenStepAfter({ listen: 1, review: 2, relisten: 3 }), null);

// Lesson loop: through the store (the store starts empty: localStorage is stubbed).
markLesson(7, 'preview', 100);
markLesson(7, 'preview', 200);
expect('mark keeps the first time', getSrsState().lessons[7], { preview: 100 });
listenedTo(7, 300);
expect('listenedTo marks listen', getSrsState().lessons[7], { preview: 100, listen: 300 });
expect('collect sends changed lessons', collectSrsChanges(250).lessons,
    [{ episodeId: 7, preview: 100, listen: 300 }]);
expect('collect skips unchanged lessons', collectSrsChanges(400).lessons, []);

const response = (lessons, resetAt) => ({
    cursor: 1,
    changes: { cards: [], deletedCards: [], decks: [], deletedDecks: [], settings: null, lessons },
    days: {},
    resetAt,
});
applySyncResult(collectSrsChanges(null), response(
    [{ episodeId: 7, preview: 50, review: 500 }, { episodeId: 8, listen: 600 }], null));
expect('sync merges lessons step by step', getSrsState().lessons,
    { 7: { preview: 100, listen: 300, review: 500 }, 8: { listen: 600 } });
applySyncResult(collectSrsChanges(null), response([], 550));
expect('a reset drops older steps', getSrsState().lessons, { 8: { listen: 600 } });
applySyncResult(collectSrsChanges(null), {
    cursor: 2,
    changes: { cards: [], deletedCards: [], decks: [], deletedDecks: [], settings: null },
    days: {},
    resetAt: 550,
});
expect('a server without lessons changes nothing', getSrsState().lessons, { 8: { listen: 600 } });

if (problems.length) {
    console.log(`${problems.length} problem(s):`);
    for (const p of problems) console.log(`  - ${p}`);
    process.exit(1);
}
console.log('All srs store checks passed.');

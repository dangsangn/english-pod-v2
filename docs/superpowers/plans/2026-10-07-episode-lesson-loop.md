# Vòng học quanh một bài (đợt B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every episode page gets a four-step lesson loop (Xem trước → Nghe → Ôn → Nghe lại) whose progress is stored and synced, and the dialogue highlights the episode's vocabulary, coloured by each card's garden stage, with a tap-to-hear-and-see-meaning popover.

**Architecture:** Lesson progress is a per-episode map of step → first-done timestamp in `srsStore` (`lessons`), synced through a new `lessons` table whose merge is "later of each field", so it never conflicts. The highlight is a pure, whitespace-insensitive matcher (`findHits`) over each dialogue line plus a thin DOM pass that wraps hits in `<mark>`; a separate effect colours the marks from the store. Sessions opened from the lesson bar carry `/lesson` in the hash, mark their step on the summary screen, and return to the podcast page.

**Tech Stack:** React 19 + TypeScript + Vite + Tailwind 4 (React Compiler on), Node scripts (ESM, `.ts` imports via Node 22 type stripping), Express + Prisma 7 + Postgres server, zod.

**Spec:** [docs/superpowers/specs/2026-10-07-episode-lesson-loop-design.md](../specs/2026-10-07-episode-lesson-loop-design.md)

**Conventions for every task:**
- Node: the default Node here is 20.9 and cannot run these scripts. Prefix every `node`/`npm`/`pnpm` command with
  `source ~/.nvm/nvm.sh && nvm use 22.18.0 >/dev/null && `.
- No test framework (by the user's choice). "Tests" are checks in `scripts/verify_*.js` that exit non-zero on failure, `server/scripts/smoke.ts`, plus `npm run typecheck`, `npm run lint`, `npm run format:check`.
- `scripts/` style: 4-space indent, single quotes, semicolons. `src/` style: 2 spaces, single quotes (also in JSX), no semicolons (Prettier). Run `npm run format` after editing `src/`.
- `src/lib` modules that Node scripts import must import other runtime modules with the `.ts` extension (`import { hitIndex } from './quiz.ts'`), as `quiz.ts` and `srsStore.ts` already do. Type-only imports use `import type` without extension.
- Commit messages: conventional (`feat:`, `fix:`, `docs:`, `chore:`), ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

**Deviations from the spec (decided while planning, spec updated in Task 0):**
1. `verify_highlight.js` requires **at least one** hit per dialogue-sourced word (a sentence can occur in more than one line), not exactly one; overlapping hits are dropped by `findHits` and reported as a count, not an error.
2. Old saved state gets `lessons: {}` from `load()`'s `{ ...DEFAULT_STATE, ...saved }` spread; `migrate` is not touched.
3. The ended-audio rule is a pure helper `listenStepAfter(progress)` used by `listenedTo(episodeId)`, so it can be checked by a script.
4. `StageBadge` moves out of `Flashcard.tsx` into its own file so `WordPopover` can reuse it.
5. `SessionSummary` gets an optional `exitLabel` ("Về bài nghe" for lesson sessions instead of "Về khu vườn").

Measured while planning: of 4,638 vocab entries with an example, 2,617 find their sentence in their episode's dialogue with this matcher, with 0 hits whose text differs from `exHit`.

---

## File map

| File | Responsibility |
| --- | --- |
| `src/lib/srsStore.ts` | `LessonStep`, `LESSON_STEPS`, `LessonProgress`, `SrsState.lessons`, `mergeLesson`, `nextLessonStep`, `listenStepAfter`, `markLesson`, `listenedTo`; lessons in `collectSrsChanges` / `applySyncResult`. |
| `scripts/verify_srs_store.js` | Checks for the lesson functions and their sync round trip. |
| `server/prisma/schema.prisma`, `server/prisma/migrations/20261007000000_lessons/migration.sql` | `Lesson` model / `lessons` table. |
| `server/src/sync/schema.ts`, `wire.ts`, `service.ts` | `lessons` in the /sync request and response, GREATEST merge, reset. |
| `server/scripts/smoke.ts` | Lesson merge and reset checks. |
| `src/lib/highlightVocab.ts` | New: `findHits` (pure) and `highlightVocab` (DOM). |
| `scripts/verify_highlight.js` | New: `findHits` against all 365 episodes. |
| `src/index.css` | `.vocab-hit` stage colours, active ring. |
| `src/components/vocab/StageBadge.tsx` | New: extracted from `Flashcard.tsx`. |
| `src/components/WordPopover.tsx` | New: the word card. |
| `src/components/Transcript.tsx` | Highlight, stage colouring, one popover state for line + word. |
| `src/components/AudioPlayer.tsx` | `onEnded`, `playRequest` props. |
| `src/components/LessonSteps.tsx` | New: the four-step bar (replaces `vocab/EpisodeVocabButton.tsx`, deleted). |
| `src/App.tsx` | `LessonSteps`, `playRequest`, `onEnded={listenedTo}`. |
| `src/components/vocab/VocabApp.tsx`, `StudySession.tsx`, `GameSession.tsx`, `SessionSummary.tsx` | `lessonStep`, marking the step, exit to the podcast page. |
| `src/components/EpisodeList.tsx` | ✓ on episodes whose loop is done. |

---

### Task 0: Record the planning deviations in the spec

**Files:**
- Modify: `docs/superpowers/specs/2026-10-07-episode-lesson-loop-design.md`

- [ ] **Step 1: Edit the spec**

In section "### Client: `src/lib/srsStore.ts`", replace the bullet
`- \`migrate\` điền \`lessons: {}\` cho state cũ.` with:

```markdown
- State cũ nhận `lessons: {}` từ phép trải `{ ...DEFAULT_STATE, ...saved }` trong `load()`.
- `listenStepAfter(p)` (hàm thuần): bước nghe mà một lần nghe hết bài sẽ đánh dấu — `listen` nếu chưa có;
  `relisten` nếu đã có `review` mà chưa có `relisten`; còn lại `null`. `listenedTo(id)` dùng nó.
```

In section "### Tự đánh dấu khi nghe xong", replace the three sub-bullets under "`App.tsx` xử lý `onEnded(id)`…" with:

```markdown
- `App.tsx` truyền `onEnded={listenedTo}`; `listenedTo` đánh dấu bước mà `listenStepAfter` trả về (nếu có).
```

In section "### Session mở từ thanh bước", append:

```markdown
- `SessionSummary` thêm prop tuỳ chọn `exitLabel`; session có `lessonStep` truyền "Về bài nghe".
```

In section "### Bấm vào từ", append:

```markdown
- `StageBadge` được tách khỏi `Flashcard.tsx` thành `src/components/vocab/StageBadge.tsx` để dùng chung.
```

In section "## Kiểm tra", replace the `verify_highlight.js` bullet with:

```markdown
- `node scripts/verify_highlight.js`: trên cả 365 bài (dòng thoại đọc bằng
  `scripts/lib/transcripts.js`), mọi mục `src:"dialogue"` ra ít nhất một hit trong thoại của bài đó
  (một câu có thể lặp ở nhiều dòng), và chuỗi tại mọi hit bằng `exHit` (bỏ qua khoảng trắng, dấu
  nháy cong). Hit chồng nhau bị bỏ và chỉ được đếm, không tính là lỗi.
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/specs/2026-10-07-episode-lesson-loop-design.md
git commit -m "docs: lesson loop spec, planning deviations

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 1: Lesson progress in the store

**Files:**
- Modify: `src/lib/srsStore.ts`
- Test: `scripts/verify_srs_store.js`

- [ ] **Step 1: Write the failing checks**

In `scripts/verify_srs_store.js`, change the import line

```js
const { buildQueue, newCardsLeft, summarize } = await import('../src/lib/srsStore.ts');
```

to

```js
const {
    applySyncResult, buildQueue, collectSrsChanges, getSrsState, listenStepAfter, listenedTo,
    markLesson, mergeLesson, newCardsLeft, nextLessonStep, summarize,
} = await import('../src/lib/srsStore.ts');
```

Update the doc comment's first lines to:

```js
/**
 * Checks srsStore's pure selectors that the new-word cap touches
 * (newCardsLeft, buildQueue, summarize) on a hand-built state, and the lesson
 * loop: its pure helpers and its round trip through the store and a sync.
```

In the `state` helper, add `lessons: {},` after `pendingLogs: [], resetAt: null,` so it reads:

```js
    tombstones: { cards: {}, decks: {} }, pendingLogs: [], resetAt: null, lessons: {},
```

Then insert, just before the `if (problems.length) {` block:

```js
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
```

- [ ] **Step 2: Run to see it fail**

Run: `node scripts/verify_srs_store.js`
Expected: crash or FAIL — `mergeLesson is not a function` (the exports do not exist yet).

- [ ] **Step 3: Implement in `src/lib/srsStore.ts`**

3a. After the `ReviewLog` interface, add:

```ts
/** The four steps of an episode's lesson loop, in order (see components/LessonSteps.tsx). */
export type LessonStep = 'preview' | 'listen' | 'review' | 'relisten'
export const LESSON_STEPS: LessonStep[] = ['preview', 'listen', 'review', 'relisten']
/** When each step was first done (ms); a missing step is not done yet. */
export type LessonProgress = Partial<Record<LessonStep, number>>
```

3b. In `SrsState`, after `resetAt: number | null`, add:

```ts
  lessons: Record<number, LessonProgress>
```

3c. In `SrsChanges`, after `resetAt: number | null`, add:

```ts
  lessons: ({ episodeId: number } & LessonProgress)[]
```

3d. Replace the `SyncResponse` interface's `changes` type with:

```ts
  changes: Omit<SrsChanges, 'reviewLogs' | 'resetAt' | 'settings' | 'lessons'> & {
    // A server from before the cap sends no newPerDay; null means no limit.
    settings:
      (Omit<Settings, 'newPerDay'> & { newPerDay?: number | null; updatedAt: number }) | null
    // A server from before the lesson loop sends none.
    lessons?: ({ episodeId: number } & LessonProgress)[]
  }
```

3e. In `DEFAULT_STATE`, after `resetAt: null,` add:

```ts
  lessons: {}, // episode id → LessonProgress
```

(`load()` spreads `DEFAULT_STATE` under the saved state, so progress saved before this gets `{}`.)

3f. After `relearnCard` and before `updateSettings`, add:

```ts
/** Record that a step of an episode's lesson loop is done. A step keeps the time it was first done. */
export function markLesson(episodeId: number, step: LessonStep, now = Date.now()) {
  setState((s) => {
    if (s.lessons[episodeId]?.[step] !== undefined) return s
    return { ...s, lessons: { ...s.lessons, [episodeId]: { ...s.lessons[episodeId], [step]: now } } }
  })
}

/** The episode's audio played to the end: mark the listening step that stands for. */
export function listenedTo(episodeId: number, now = Date.now()) {
  const step = listenStepAfter(state.lessons[episodeId])
  if (step) markLesson(episodeId, step, now)
}
```

3g. In the "Selectors" section, after `newCardsLeft`, add:

```ts
/** The first step of the loop not done yet; null once all four are. */
export function nextLessonStep(progress: LessonProgress | undefined): LessonStep | null {
  return LESSON_STEPS.find((step) => progress?.[step] === undefined) ?? null
}

/**
 * The step that listening to the whole episode completes: the first listen,
 * or the listen again once the words have been reviewed. Otherwise none.
 */
export function listenStepAfter(progress: LessonProgress | undefined): LessonStep | null {
  if (progress?.listen === undefined) return 'listen'
  if (progress.review !== undefined && progress.relisten === undefined) return 'relisten'
  return null
}

/**
 * Two copies of an episode's progress as one. Steps only ever get done, so
 * the merge is the later time of each step, whatever order copies arrive in;
 * steps from before a reset are dropped.
 */
export function mergeLesson(
  a: LessonProgress | undefined,
  b: LessonProgress | undefined,
  resetAt: number | null,
): LessonProgress {
  const merged: LessonProgress = {}
  for (const step of LESSON_STEPS) {
    const time = Math.max(a?.[step] ?? -1, b?.[step] ?? -1)
    if (time >= 0 && time >= (resetAt ?? 0)) merged[step] = time
  }
  return merged
}

/** The latest step time: when the progress last changed. */
const lessonTime = (progress: LessonProgress) =>
  Math.max(0, ...LESSON_STEPS.map((step) => progress[step] ?? 0))
```

3h. In `collectSrsChanges`, after `resetAt: s.resetAt,` add:

```ts
    lessons: Object.entries(s.lessons)
      .filter(([, progress]) => changed(lessonTime(progress)))
      .map(([episodeId, progress]) => ({ episodeId: Number(episodeId), ...progress })),
```

3i. In `applySyncResult`, just before the line `let { settings, settingsUpdatedAt, resetAt } = s`, add:

```ts
      const lessons = { ...s.lessons }
      // An episode left with no step (a reset) is dropped rather than kept empty.
      const putLesson = (episodeId: number, progress: LessonProgress) => {
        if (Object.keys(progress).length) lessons[episodeId] = progress
        else delete lessons[episodeId]
      }
      for (const { episodeId, ...remote } of changes.lessons ?? []) {
        putLesson(episodeId, mergeLesson(lessons[episodeId], remote, s.resetAt))
      }
```

Inside the `if (response.resetAt !== null && response.resetAt > (resetAt ?? -1)) {` block, after the line `decks = decks.filter((episodeId) => episodeId in deckMeta)`, add:

```ts
        for (const [episodeId, progress] of Object.entries(lessons)) {
          putLesson(Number(episodeId), mergeLesson(progress, undefined, resetAt))
        }
```

And in the returned object, after `resetAt,` add:

```ts
        lessons,
```

- [ ] **Step 4: Run the checks**

Run: `node scripts/verify_srs_store.js`
Expected: `All srs store checks passed.`

Run: `npm run typecheck`
Expected: exit 0. (If `src/lib/sync.ts` builds an `SrsChanges` by hand anywhere, it now needs `lessons`; it does not today — it passes `collectSrsChanges(...)` through.)

- [ ] **Step 5: Format, lint, commit**

Run: `npm run format && npm run lint`
Expected: lint exit 0.

```bash
git add src/lib/srsStore.ts scripts/verify_srs_store.js
git commit -m "feat: lesson loop progress in the store, merged step by step on sync

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Lessons on the server

**Files:**
- Modify: `server/prisma/schema.prisma`
- Create: `server/prisma/migrations/20261007000000_lessons/migration.sql`
- Modify: `server/src/sync/schema.ts`, `server/src/sync/wire.ts`, `server/src/sync/service.ts`
- Test: `server/scripts/smoke.ts`

All commands in `server/` with pnpm: `cd server && source ~/.nvm/nvm.sh && nvm use 22.18.0 >/dev/null && …`.

- [ ] **Step 1: Failing smoke checks**

In `server/scripts/smoke.ts`, insert before `await check('reset clears cards, decks and history everywhere', …`:

```ts
await check('lessons merge step by step across devices', async () => {
  await sync(A, { lessons: [{ episodeId: 3, preview: 8000, listen: 8100 }] })
  await sync(B, { lessons: [{ episodeId: 3, preview: 7000, review: 8200 }] })
  const a = await sync(A)
  assert.deepEqual(a.changes.lessons, [{ episodeId: 3, preview: 8000, listen: 8100, review: 8200 }])
  await sync(B, { lessons: [{ episodeId: 3, preview: 7000 }] })
  const again = await sync(A)
  assert.equal(again.changes.lessons.length, 0, 'an older step must not bump rev')
})
```

Inside the reset check, after the line
`assert.ok(b.changes.deletedDecks.some((d: { episodeId: number }) => d.episodeId === 2))`, add:

```ts
  assert.deepEqual(
    b.changes.lessons.find((l: { episodeId: number }) => l.episodeId === 3),
    { episodeId: 3 },
    'steps older than the reset are cleared',
  )
```

- [ ] **Step 2: Run to see it fail**

Run: `pnpm typecheck && pnpm smoke`
Expected: typecheck passes; smoke reports `lessons merge step by step across devices` failing (`changes.lessons` is undefined) and the reset check failing. If the DB in `.env` is unreachable, note it and continue — Step 6 must then report that smoke could not run.

- [ ] **Step 3: Schema and migration**

In `server/prisma/schema.prisma`, in `model User`, after `legacyDays  LegacyDay[]` add:

```prisma
  lessons     Lesson[]
```

After `model Deck { … }`, add:

```prisma
// When each step of an episode's lesson loop was first done (src/lib/srsStore.ts).
// Steps only ever get done, so rows merge by the later time of each column.
model Lesson {
  userId       String  @map("user_id") @db.Uuid
  episodeId    Int     @map("episode_id")
  previewedAt  BigInt? @map("previewed_at")
  listenedAt   BigInt? @map("listened_at")
  reviewedAt   BigInt? @map("reviewed_at")
  relistenedAt BigInt? @map("relistened_at")
  rev          BigInt
  user         User    @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@id([userId, episodeId])
  @@index([userId, rev])
  @@map("lessons")
}
```

Create `server/prisma/migrations/20261007000000_lessons/migration.sql`:

```sql
-- Each episode's lesson loop: when each of its four steps was first done.
CREATE TABLE "lessons" (
    "user_id" UUID NOT NULL,
    "episode_id" INTEGER NOT NULL,
    "previewed_at" BIGINT,
    "listened_at" BIGINT,
    "reviewed_at" BIGINT,
    "relistened_at" BIGINT,
    "rev" BIGINT NOT NULL,

    CONSTRAINT "lessons_pkey" PRIMARY KEY ("user_id","episode_id")
);

CREATE INDEX "lessons_user_id_rev_idx" ON "lessons"("user_id", "rev");

ALTER TABLE "lessons" ADD CONSTRAINT "lessons_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

- [ ] **Step 4: zod schema and wire shapes**

In `server/src/sync/schema.ts`, after `deckSchema`, add:

```ts
// A step missing from a lesson is not done (yet) on that device.
export const lessonSchema = z.object({
  episodeId: z.number().int(),
  preview: ms.optional(),
  listen: ms.optional(),
  review: ms.optional(),
  relisten: ms.optional(),
})
```

In `syncRequestSchema.changes`, after the `deletedDecks` line, add:

```ts
    // Absent from a client older than the lesson loop.
    lessons: z.array(lessonSchema).max(1000).default([]),
```

In `server/src/sync/wire.ts`:
- Change the imports to:

```ts
import type { Card, Deck, Lesson, Settings } from '../generated/prisma/client.js'
import type { cardSchema, dayCountsSchema, deckSchema, lessonSchema, settingsSchema } from './schema.js'
```

- After `export type WireDeck = …`, add `export type WireLesson = z.infer<typeof lessonSchema>`.
- In `SyncResponse.changes`, after `settings: WireSettings | null`, add `lessons: WireLesson[]`.
- After `toWireDeck`, add:

```ts
/** A step the row has no time for is left out, as devices send it. */
export function toWireLesson(l: Lesson): WireLesson {
  const lesson: WireLesson = { episodeId: l.episodeId }
  if (l.previewedAt !== null) lesson.preview = num(l.previewedAt)
  if (l.listenedAt !== null) lesson.listen = num(l.listenedAt)
  if (l.reviewedAt !== null) lesson.review = num(l.reviewedAt)
  if (l.relistenedAt !== null) lesson.relisten = num(l.relistenedAt)
  return lesson
}
```

- [ ] **Step 5: Merge, reset and pull in `server/src/sync/service.ts`**

5a. Update the wire import:

```ts
import { latestBy, toWireCard, toWireDeck, toWireLesson, toWireSettings, type SyncResponse } from './wire.js'
```

5b. In `runSync`, after `await deleteDecks(tx, userId, changes.deletedDecks)`, add:

```ts
      await upsertLessons(tx, userId, changes.lessons, resetAt)
```

5c. In `applyReset`, inside `if (moved > 0) {`, after the decks `UPDATE`, add:

```ts
      await tx.$executeRaw`
        UPDATE lessons SET
          previewed_at = CASE WHEN previewed_at < ${incoming} THEN NULL ELSE previewed_at END,
          listened_at = CASE WHEN listened_at < ${incoming} THEN NULL ELSE listened_at END,
          reviewed_at = CASE WHEN reviewed_at < ${incoming} THEN NULL ELSE reviewed_at END,
          relistened_at = CASE WHEN relistened_at < ${incoming} THEN NULL ELSE relistened_at END,
          rev = nextval('sync_rev')
        WHERE user_id = ${userId}::uuid AND (previewed_at < ${incoming} OR listened_at < ${incoming}
          OR reviewed_at < ${incoming} OR relistened_at < ${incoming})`
```

5d. After `deleteDecks`, add:

```ts
type WireLessonIn = SyncChanges['lessons'][number]

/**
 * Steps only ever get done, so a lesson merges by the later time of each step
 * (GREATEST skips NULLs), whatever order devices push in. The row's rev moves
 * only when a step actually changes, so a stale push wakes no other device.
 */
async function upsertLessons(tx: Tx, userId: string, lessons: SyncChanges['lessons'], resetAt: number) {
  const later = (a: number | undefined, b: number | undefined) =>
    a === undefined ? b : b === undefined ? a : Math.max(a, b)
  const kept = (time: number | undefined) => (time !== undefined && time >= resetAt ? time : undefined)
  const byEpisode = new Map<number, WireLessonIn>()
  for (const l of lessons) {
    const seen = byEpisode.get(l.episodeId)
    byEpisode.set(l.episodeId, {
      episodeId: l.episodeId,
      preview: later(seen?.preview, kept(l.preview)),
      listen: later(seen?.listen, kept(l.listen)),
      review: later(seen?.review, kept(l.review)),
      relisten: later(seen?.relisten, kept(l.relisten)),
    })
  }
  const rows = [...byEpisode.values()].filter(
    (l) => l.preview !== undefined || l.listen !== undefined || l.review !== undefined || l.relisten !== undefined,
  )
  if (!rows.length) return
  await tx.$executeRaw`
    INSERT INTO lessons AS l (user_id, episode_id, previewed_at, listened_at, reviewed_at, relistened_at, rev)
    SELECT ${userId}::uuid, x."episodeId", x."preview", x."listen", x."review", x."relisten", nextval('sync_rev')
    FROM jsonb_to_recordset(${JSON.stringify(rows)}::jsonb)
      AS x("episodeId" int, "preview" bigint, "listen" bigint, "review" bigint, "relisten" bigint)
    ON CONFLICT (user_id, episode_id) DO UPDATE SET
      previewed_at = GREATEST(l.previewed_at, EXCLUDED.previewed_at),
      listened_at = GREATEST(l.listened_at, EXCLUDED.listened_at),
      reviewed_at = GREATEST(l.reviewed_at, EXCLUDED.reviewed_at),
      relistened_at = GREATEST(l.relistened_at, EXCLUDED.relistened_at),
      rev = EXCLUDED.rev
    WHERE GREATEST(l.previewed_at, EXCLUDED.previewed_at) IS DISTINCT FROM l.previewed_at
      OR GREATEST(l.listened_at, EXCLUDED.listened_at) IS DISTINCT FROM l.listened_at
      OR GREATEST(l.reviewed_at, EXCLUDED.reviewed_at) IS DISTINCT FROM l.reviewed_at
      OR GREATEST(l.relistened_at, EXCLUDED.relistened_at) IS DISTINCT FROM l.relistened_at`
}
```

(`JSON.stringify` drops `undefined` fields, so `jsonb_to_recordset` reads them as NULL.)

5e. In `PushedKeys`, after `episodeIds: number[]`, add `lessonEpisodeIds: number[]`. In `pushedKeys`, after the `episodeIds: [...]` entry, add:

```ts
    lessonEpisodeIds: changes.lessons.map((l) => l.episodeId),
```

5f. In `pull`, after the `decks` query, add:

```ts
  const lessons = await tx.lesson.findMany({
    where: { userId, OR: [{ rev: { gt: since } }, { episodeId: { in: pushed.lessonEpisodeIds } }] },
  })
```

Change the `revs` line to:

```ts
  const revs = [...cards, ...decks, ...lessons, ...(settings ? [settings] : [])].map((row) => row.rev)
```

And in the returned `changes`, after `settings: settings ? toWireSettings(settings) : null,`, add:

```ts
      lessons: lessons.map(toWireLesson),
```

- [ ] **Step 6: Migrate, typecheck, smoke**

Run: `pnpm prisma migrate deploy && pnpm typecheck && pnpm smoke`
Expected: migration `20261007000000_lessons` applied to the dev DB in `.env`; typecheck passes; smoke prints every check passing, including `lessons merge step by step across devices` and the reset check. If the DB in `.env` is unreachable, run only `pnpm typecheck`, and report that smoke could not run.

- [ ] **Step 7: Commit**

```bash
git add server/prisma server/src/sync server/scripts/smoke.ts
git commit -m "feat: sync lesson loop progress, merged by the later time of each step

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Deployment note for the user (no CI deploys the server): run `pnpm prisma migrate deploy` on the production DB **before** deploying the new server build. The new client works against the old server (it treats a missing `lessons` as none); an old client against the new server sends no `lessons` (defaults to `[]`) and ignores the extra response field.

---

### Task 3: Finding the vocabulary in a dialogue line (pure)

**Files:**
- Create: `src/lib/highlightVocab.ts`
- Test: `scripts/verify_highlight.js`

- [ ] **Step 1: Write the check script**

Create `scripts/verify_highlight.js`:

```js
/**
 * Checks src/lib/highlightVocab.findHits against every episode: each word whose
 * example sentence was taken from an episode's dialogue (scripts/data/vocab-ex,
 * src "dialogue") is found in that episode's dialogue, and every hit covers
 * exactly the word's text (ignoring whitespace and curly apostrophes, as the
 * matcher does).
 *
 * Usage:
 *   node scripts/verify_highlight.js
 */

import fs from 'fs';
import path from 'path';
import { LAST_EPISODE, ROOT, readDialogue } from './lib/transcripts.js';
import { readExampleRows } from './lib/examples.js';
import { findHits } from '../src/lib/highlightVocab.ts';

const squash = (t) => t.replace(/\s+/g, '').replace(/[’‘ʼ]/g, "'");
const vocabOf = (ep) => {
    const file = path.join(ROOT, 'public/vocab', `englishpod_${String(ep).padStart(4, '0')}.json`);
    return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf-8')) : [];
};

const problems = [];
let hits = 0;
let dropped = 0;
let episodes = 0;

// The words whose sentence comes from each episode's dialogue.
const fromDialogue = new Map();
for (const { row } of readExampleRows()) {
    if (row.src !== 'dialogue') continue;
    if (!fromDialogue.has(row.ep)) fromDialogue.set(row.ep, []);
    fromDialogue.get(row.ep).push(row);
}

for (let ep = 1; ep <= LAST_EPISODE; ep++) {
    const entries = vocabOf(ep);
    const lines = readDialogue(ep).map((l) => l.text);
    if (!entries.length || !lines.length) continue;
    episodes++;

    for (const row of fromDialogue.get(ep) ?? []) {
        const entry = entries.find((e) => e.word === row.w && e.ex === row.ex);
        if (!entry) {
            problems.push(`episode ${ep} "${row.w}": no vocab entry carries this sentence (rebuild vocab?)`);
            continue;
        }
        if (!lines.some((line) => findHits(line, [entry]).length)) {
            problems.push(`episode ${ep} "${row.w}": not found in the dialogue`);
        }
    }

    for (const line of lines) {
        const found = findHits(line, entries);
        const alone = entries.reduce((n, e) => n + findHits(line, [e]).length, 0);
        dropped += alone - found.length;
        for (const hit of found) {
            hits++;
            const text = line.slice(hit.start, hit.end);
            if (squash(text) !== squash(hit.entry.exHit)) {
                problems.push(`episode ${ep} "${hit.entry.word}": hit "${text}" is not "${hit.entry.exHit}"`);
            }
        }
        for (let i = 1; i < found.length; i++) {
            if (found[i].start < found[i - 1].end) problems.push(`episode ${ep}: overlapping hits in "${line}"`);
        }
    }
}

if (problems.length) {
    console.log(`${problems.length} problem(s):`);
    for (const p of problems.slice(0, 50)) console.log(`  - ${p}`);
    process.exit(1);
}
console.log(
    `All highlight checks passed: ${hits} hits in ${episodes} episodes (${dropped} dropped as overlapping).`,
);
```

- [ ] **Step 2: Run to see it fail**

Run: `node scripts/verify_highlight.js`
Expected: crash with `Cannot find module …/src/lib/highlightVocab.ts`.

- [ ] **Step 3: Implement the pure part**

Create `src/lib/highlightVocab.ts`:

```ts
// The episode's vocabulary in its dialogue: each word sits in the line its
// example sentence was taken from (scripts/data/vocab-ex, src "dialogue").
// Written sentences are not in the dialogue and find nothing, by design.
//
// Transcripts sometimes glue words together ("wantyou") or use curly
// apostrophes, while example sentences are stored with single spaces and
// straight ones. So matching ignores whitespace and folds apostrophes — the
// rule scripts/verify_examples.js checks the data with — but every position
// returned is an offset into the original text, for the DOM pass to wrap.

import { hitIndex } from './quiz.ts'
import { cardId } from './srs.ts'
import type { VocabEntry } from '../types'

export interface HitRange {
  /** [start, end) in the line's text. */
  start: number
  end: number
  entry: VocabEntry
}

const SPACE = /\s/
const fold = (c: string) => (c === '’' || c === '‘' || c === 'ʼ' ? "'" : c)

/** The text without whitespace, apostrophes folded, and where each kept character was. */
function squash(text: string): { chars: string; at: number[] } {
  let chars = ''
  const at: number[] = []
  for (let i = 0; i < text.length; i++) {
    if (SPACE.test(text[i])) continue
    chars += fold(text[i])
    at.push(i)
  }
  return { chars, at }
}

/**
 * Where the entries' words are in one dialogue line: for each entry whose
 * example sentence is in the line, its `exHit`. Sorted, never overlapping —
 * of two overlapping hits the earlier one stays (the longer, on a tie).
 */
export function findHits(text: string, entries: VocabEntry[]): HitRange[] {
  const line = squash(text)
  const hits: HitRange[] = []
  for (const entry of entries) {
    if (!entry.ex || !entry.exHit) continue
    const sentence = squash(entry.ex).chars
    const from = sentence ? line.chars.indexOf(sentence) : -1
    const hitAt = hitIndex(entry.ex, entry.exHit)
    const length = squash(entry.exHit).chars.length
    if (from < 0 || hitAt < 0 || !length) continue
    // The non-space characters before the hit in the sentence: as many come
    // before it in the line, counted from where the sentence starts.
    const skip = squash(entry.ex.slice(0, hitAt)).chars.length
    hits.push({
      start: line.at[from + skip],
      end: line.at[from + skip + length - 1] + 1,
      entry,
    })
  }
  hits.sort((a, b) => a.start - b.start || b.end - a.end)
  const kept: HitRange[] = []
  for (const hit of hits) {
    if (!kept.length || hit.start >= kept[kept.length - 1].end) kept.push(hit)
  }
  return kept
}
```

(`cardId` is imported now for Task 4's DOM pass, which goes in this file; if lint flags it as unused in this commit, leave the import out until Task 4.)

- [ ] **Step 4: Run the check**

Run: `node scripts/verify_highlight.js`
Expected: `All highlight checks passed: N hits in 365 episodes (M dropped as overlapping).` with N around 2,600. If it reports problems, fix `findHits` (not the data) unless a problem shows a vocab file out of date with `scripts/data/vocab-ex` — then report it rather than rebuilding.

- [ ] **Step 5: Lint, commit**

Run: `npm run format && npm run lint && npm run typecheck`
Expected: all exit 0.

```bash
git add src/lib/highlightVocab.ts scripts/verify_highlight.js
git commit -m "feat: find the episode's words in its dialogue lines

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Highlight in the transcript, coloured by stage

**Files:**
- Modify: `src/lib/highlightVocab.ts`
- Modify: `src/components/Transcript.tsx`
- Modify: `src/index.css`

- [ ] **Step 1: The DOM pass**

Append to `src/lib/highlightVocab.ts` (add the `cardId` import now if Task 3 left it out):

```ts
/**
 * Wrap the vocabulary in the dialogue lines in <mark class="vocab-hit">, with
 * data-card (the card id) and data-word (the entry's word) for the click
 * handler and the stage colouring. Run it before the translate buttons go in,
 * so a line's text is only its words. Safe to call again: earlier marks are
 * unwrapped first.
 *
 * @returns how many words were marked
 */
export function highlightVocab(rootEl: HTMLElement, entries: VocabEntry[]): number {
  rootEl.querySelectorAll('mark.vocab-hit').forEach((mark) => mark.replaceWith(...mark.childNodes))
  rootEl.normalize()

  let marked = 0
  rootEl.querySelectorAll<HTMLElement>('.dialogue-block .text').forEach((line) => {
    // Last first: wrapping a hit then leaves the earlier offsets where they were.
    for (const hit of findHits(line.textContent ?? '', entries).reverse()) {
      const range = rangeOf(line, hit.start, hit.end)
      if (!range) continue
      const mark = document.createElement('mark')
      mark.className = 'vocab-hit'
      mark.dataset.card = cardId(hit.entry.word)
      mark.dataset.word = hit.entry.word
      mark.append(range.extractContents())
      range.insertNode(mark)
      marked++
    }
  })
  return marked
}

/** A DOM Range over [start, end) of `el`'s text, across as many text nodes as it spans. */
function rangeOf(el: HTMLElement, start: number, end: number): Range | null {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  const range = document.createRange()
  let offset = 0
  let started = false
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const length = node.textContent?.length ?? 0
    if (!started && start < offset + length) {
      range.setStart(node, start - offset)
      started = true
    }
    if (started && end <= offset + length) {
      range.setEnd(node, end - offset)
      return range
    }
    offset += length
  }
  return null
}
```

- [ ] **Step 2: Call it and colour the marks in `Transcript.tsx`**

Add imports:

```ts
import { highlightVocab } from '../lib/highlightVocab'
import { isLeech, stageOf } from '../lib/srs'
import { useSrs } from '../lib/srsStore'
```

In the component, after `const activeButtonRef = useRef<HTMLElement | null>(null)`, add:

```ts
  const srs = useSrs()
```

In the render effect, replace

```ts
    if (vocab) decorateVocab(contentRef.current, vocab)
```

with

```ts
    if (vocab) {
      decorateVocab(contentRef.current, vocab)
      // Before the translate buttons, so each line's text is only its words.
      highlightVocab(contentRef.current, vocab)
    }
```

Directly after that effect, add:

```ts
  // Colour each highlighted word by its card's garden stage. Separate from the
  // effect above, so answering a card recolours the words without injecting
  // the transcript again; it re-runs whenever that effect does.
  useEffect(() => {
    contentRef.current?.querySelectorAll<HTMLElement>('mark.vocab-hit').forEach((mark) => {
      const card = srs.cards[mark.dataset.card ?? '']
      if (card) mark.dataset.stage = stageOf(card)
      else delete mark.dataset.stage
      mark.toggleAttribute('data-leech', Boolean(card && isLeech(card)))
    })
  }, [srs.cards, content, loading, vocab, lineTranslations])
```

- [ ] **Step 3: Styles in `src/index.css`**

After the `.transcript-content .definition .translation { … }` rule, add:

```css
/* The episode's vocabulary in the dialogue (src/lib/highlightVocab.ts),
   coloured by the card's garden stage (src/components/vocab/stages.ts). A word
   not in the garden yet only gets a dotted underline. */
.transcript-content mark.vocab-hit {
  cursor: pointer;
  color: inherit;
  background: transparent;
  border-radius: 0.25rem;
  padding: 0 0.125rem;
  box-decoration-break: clone;
  -webkit-box-decoration-break: clone;
  text-decoration-line: underline;
  text-decoration-style: dotted;
  text-underline-offset: 3px;
  @apply decoration-zinc-400 dark:decoration-zinc-500;
}

.transcript-content mark.vocab-hit[data-stage] {
  text-decoration-line: none;
}

.transcript-content mark.vocab-hit[data-stage='seed'] {
  @apply bg-amber-100 dark:bg-amber-500/20;
}

.transcript-content mark.vocab-hit[data-stage='sprout'] {
  @apply bg-lime-100 dark:bg-lime-500/20;
}

.transcript-content mark.vocab-hit[data-stage='bud'] {
  @apply bg-pink-100 dark:bg-pink-500/20;
}

.transcript-content mark.vocab-hit[data-stage='bloom'] {
  @apply bg-rose-100 dark:bg-rose-500/25;
}

/* Hay quên (srs.isLeech): a red underline on top of the stage colour. */
.transcript-content mark.vocab-hit[data-leech] {
  box-shadow: inset 0 -2px 0 var(--color-red-500);
}

/* The word whose card is open (components/WordPopover.tsx). */
.transcript-content mark.vocab-hit.vocab-hit-active {
  @apply ring-2 ring-rose-400 dark:ring-rose-500;
}
```

- [ ] **Step 4: Verify**

Run: `npm run format && npm run typecheck && npm run lint && npm run build`
Expected: all exit 0.

Then use the `run` skill (or `npm run dev`) to open the app, open episode 1, press "Show" on the transcript, and confirm:
- "go with", "would recommend", "complimentary", "still working on", "grab" are marked in the dialogue lines;
- with episode 1 not in the garden, they have a dotted underline only; after adding the deck (Vườn từ vựng → Chọn bộ từ → bài 1), they turn amber (seed);
- the translate button still sits at the end of each line and still opens its card;
- dark mode looks right.

- [ ] **Step 5: Commit**

```bash
git add src/lib/highlightVocab.ts src/components/Transcript.tsx src/index.css
git commit -m "feat: highlight the episode's words in the dialogue, by garden stage

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The word popover

**Files:**
- Create: `src/components/vocab/StageBadge.tsx`
- Modify: `src/components/vocab/Flashcard.tsx`
- Create: `src/components/WordPopover.tsx`
- Modify: `src/components/Transcript.tsx`

- [ ] **Step 1: Move `StageBadge` to its own file**

Create `src/components/vocab/StageBadge.tsx`:

```tsx
import classNames from 'classnames'
import type { StageStyle } from './stages'

/** The card's garden stage as a coloured pill; "Từ mới" for a card never studied. */
export default function StageBadge({ stage, isNew }: { stage: StageStyle; isNew: boolean }) {
  const { Icon } = stage
  return (
    <span
      className={classNames(
        'self-start inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold',
        stage.tile,
      )}
    >
      <Icon size={14} />
      {isNew ? 'Từ mới' : stage.label}
    </span>
  )
}
```

In `src/components/vocab/Flashcard.tsx`, delete the local `function StageBadge(…) { … }` at the end of the file, and add `import StageBadge from './StageBadge'` after `import LeechBadge from './LeechBadge'`. Leave the other imports as they are (`classNames` and `StageStyle` are still used elsewhere in the file; `npm run lint`/`typecheck` will say if not).

- [ ] **Step 2: Create `src/components/WordPopover.tsx`**

```tsx
import type { RefObject } from 'react'
import { Volume2, X } from 'lucide-react'
import { cardId, isLeech, stageOf } from '../lib/srs'
import { useSrs } from '../lib/srsStore'
import { speak } from '../lib/speech'
import FloatingCard from './FloatingCard'
import LeechBadge from './vocab/LeechBadge'
import StageBadge from './vocab/StageBadge'
import { STAGE_BY_KEY } from './vocab/stages'
import type { VocabEntry } from '../types'

const WIDTH = 288

export interface WordTarget {
  entry: VocabEntry
  rect: DOMRect
}

interface WordPopoverProps {
  target: WordTarget
  /** The highlighted word: pressing it again toggles rather than reopens. */
  anchor?: RefObject<Element | null>
  onClose: () => void
}

/**
 * Small card next to a highlighted word in the dialogue: the word, its IPA
 * and Vietnamese, and where it stands in the garden. The card in the garden
 * wins over the episode's vocab file, so it shows what is being studied.
 */
export default function WordPopover({ target, anchor, onClose }: WordPopoverProps) {
  const srs = useSrs()
  const card = srs.cards[cardId(target.entry.word)]
  const { word, ipa, vi, viDef } = card ?? target.entry
  const meaning = [vi, viDef].filter(Boolean).join(' — ')

  return (
    <FloatingCard rect={target.rect} width={WIDTH} label={`Từ vựng: ${word}`} anchor={anchor} onClose={onClose}>
      <div className='flex items-start gap-2'>
        <div className='flex-1 min-w-0 pt-1'>
          <p className='text-lg font-bold leading-tight'>{word}</p>
          {ipa && <p className='text-sm text-zinc-400 dark:text-zinc-500'>/{ipa}/</p>}
        </div>
        <button
          type='button'
          onClick={() => speak(word)}
          title='Nghe từ'
          aria-label='Nghe từ'
          className='p-2 rounded-full text-zinc-500 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800'
        >
          <Volume2 size={18} />
        </button>
        <button
          type='button'
          onClick={onClose}
          title='Đóng'
          aria-label='Đóng'
          className='p-2 -mr-2 rounded-full text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
        >
          <X size={18} />
        </button>
      </div>
      {meaning && (
        <p className='vi-text mt-2 text-base text-indigo-600 dark:text-indigo-400'>{meaning}</p>
      )}
      <div className='mt-3 flex flex-wrap gap-1.5'>
        {card ? (
          <>
            <StageBadge stage={STAGE_BY_KEY[stageOf(card)]} isNew={card.state === 'new'} />
            {isLeech(card) && <LeechBadge />}
          </>
        ) : (
          <span className='inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'>
            Chưa học
          </span>
        )}
      </div>
    </FloatingCard>
  )
}
```

(`VocabEntry.ipa`/`vi`/`viDef` are optional, the card's are strings; both render through the `&&` / `filter(Boolean)` guards above.)

- [ ] **Step 3: One popover state in `Transcript.tsx`**

Add imports:

```ts
import WordPopover from './WordPopover'
import type { WordTarget } from './WordPopover'
```

Above the component, add:

```ts
// One card at a time, for a line's translation or a highlighted word.
type Lookup = { kind: 'line'; target: LineTarget } | { kind: 'word'; target: WordTarget }
```

Replace the lookup state and its two functions:

```ts
  // The line whose translation is showing, and its button.
  const [lookup, setLookup] = useState<LineTarget | null>(null)
```

becomes

```ts
  // The open card (a line's translation or a word), and the element it is for.
  const [lookup, setLookup] = useState<Lookup | null>(null)
```

and

```ts
  const closeLookup = () => {
    activeButtonRef.current?.classList.remove('line-translate-active')
    activeButtonRef.current = null
    setLookup(null)
  }

  const openLookup = (target: LineTarget, button: HTMLElement) => {
    activeButtonRef.current?.classList.remove('line-translate-active')
    activeButtonRef.current = button
    button.classList.add('line-translate-active')
    setLookup(target)
  }
```

becomes

```ts
  const ACTIVE_CLASSES = ['line-translate-active', 'vocab-hit-active']

  const closeLookup = () => {
    activeButtonRef.current?.classList.remove(...ACTIVE_CLASSES)
    activeButtonRef.current = null
    setLookup(null)
  }

  const openLookup = (next: Lookup, el: HTMLElement) => {
    activeButtonRef.current?.classList.remove(...ACTIVE_CLASSES)
    activeButtonRef.current = el
    el.classList.add(next.kind === 'line' ? 'line-translate-active' : 'vocab-hit-active')
    setLookup(next)
  }
```

In `onContentClick`, insert at the top, right after `const target = e.target as Element`:

```ts
    // A highlighted word in the dialogue: say it and show its card.
    const mark = target.closest<HTMLElement>('mark.vocab-hit')
    if (mark) {
      if (mark === activeButtonRef.current) return closeLookup()
      const entry = vocab?.find((v) => v.word === mark.dataset.word)
      if (!entry) return
      speak(entry.word)
      openLookup({ kind: 'word', target: { entry, rect: mark.getBoundingClientRect() } }, mark)
      return
    }
```

In the line-button branch, change

```ts
        openLookup({ text, rect: lineButton.getBoundingClientRect(), translation }, lineButton)
```

to

```ts
        openLookup(
          { kind: 'line', target: { text, rect: lineButton.getBoundingClientRect(), translation } },
          lineButton,
        )
```

Replace the popover render

```tsx
      {lookup && isVisible && (
        <TranslatePopover target={lookup} anchor={activeButtonRef} onClose={closeLookup} />
      )}
```

with

```tsx
      {lookup &&
        isVisible &&
        (lookup.kind === 'line' ? (
          <TranslatePopover target={lookup.target} anchor={activeButtonRef} onClose={closeLookup} />
        ) : (
          <WordPopover target={lookup.target} anchor={activeButtonRef} onClose={closeLookup} />
        ))}
```

(Move `ACTIVE_CLASSES` to module scope instead if the React Compiler lint complains about a constant array in the component.)

- [ ] **Step 4: Verify**

Run: `npm run format && npm run typecheck && npm run lint && npm run build`
Expected: all exit 0.

In the app (episode 1, transcript shown):
- tap "go with" → it is spoken, a card shows "go with", `/ɡoʊ wɪð/`, "chọn — lựa chọn, quyết định lấy", and a stage pill (or "Chưa học"); the word gets a rose ring;
- tap it again → the card closes; tap a line's translate button → the word card closes and the translation opens;
- Escape and scrolling close the card;
- the flashcard in Vườn từ vựng still shows its stage badge (StageBadge move).

- [ ] **Step 5: Commit**

```bash
git add src/components/vocab/StageBadge.tsx src/components/vocab/Flashcard.tsx src/components/WordPopover.tsx src/components/Transcript.tsx
git commit -m "feat: tap a highlighted word to hear it and see its card

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Audio player hooks for the lesson loop

**Files:**
- Modify: `src/components/AudioPlayer.tsx`

- [ ] **Step 1: Props**

In `AudioPlayerProps`, after `onPlayingChange?: (playing: boolean) => void`, add:

```ts
  /** The episode played to its end (before any loop or move to the next one). */
  onEnded?: (episodeId: number) => void
  /** Bumped to ask for the episode from the top; ignored while it is playing. */
  playRequest?: number
```

In the destructuring, after `onPlayingChange,` add:

```ts
  onEnded,
  playRequest = 0,
```

- [ ] **Step 2: Report the end**

Make `handleEnded` start with the call:

```ts
  const handleEnded = () => {
    onEnded?.(episode.id)
    setIsPlaying(false)
```

(rest unchanged).

- [ ] **Step 3: Play from the top on request**

After the `[suspended]` effect, add:

```ts
  // The lesson bar's Nghe / Nghe lại: the episode from the top, unless it is
  // already playing. The first value is where we start, not a request.
  const playRequestRef = useRef(playRequest)
  useEffect(() => {
    if (playRequest === playRequestRef.current) return
    playRequestRef.current = playRequest
    const audio = audioRef.current
    if (!audio || !audio.paused) return
    audio.currentTime = 0
    audio
      .play()
      .then(() => setIsPlaying(true))
      .catch(() => setIsPlaying(false))
  }, [playRequest])
```

- [ ] **Step 4: Verify and commit**

Run: `npm run format && npm run typecheck && npm run lint`
Expected: all exit 0. (Behaviour is checked in Task 7, which wires these props.)

```bash
git add src/components/AudioPlayer.tsx
git commit -m "feat: audio player reports the end and can start over on request

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The lesson bar on the episode page

**Files:**
- Create: `src/components/LessonSteps.tsx`
- Delete: `src/components/vocab/EpisodeVocabButton.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Create `src/components/LessonSteps.tsx`**

```tsx
import { useState } from 'react'
import { Check, Loader2 } from 'lucide-react'
import classNames from 'classnames'
import { navigate } from '../lib/hooks'
import { addEpisodeDeck, LESSON_STEPS, markLesson, nextLessonStep, useSrs } from '../lib/srsStore'
import type { LessonStep } from '../lib/srsStore'
import type { Episode } from '../types'

const LABELS: Record<LessonStep, string> = {
  preview: 'Xem trước',
  listen: 'Nghe',
  review: 'Ôn',
  relisten: 'Nghe lại',
}

interface LessonStepsProps {
  episode: Episode
  /** Nghe / Nghe lại: play the episode (from the top unless it is playing). */
  onListen: () => void
}

/**
 * The episode's lesson loop: preview its words, listen, review the words,
 * listen again. Any step can be pressed at any time; the next one stands out.
 * Progress is in the synced store (srsStore.lessons): the study steps are
 * marked by their session's summary screen, the listening steps when the
 * audio plays to the end (srsStore.listenedTo) or by "Đã nghe xong".
 */
export default function LessonSteps({ episode, onListen }: LessonStepsProps) {
  const srs = useSrs()
  const progress = srs.lessons[episode.id]
  const next = nextLessonStep(progress)
  const [status, setStatus] = useState<{ id: number | null; state: 'idle' | 'loading' | 'error' }>({
    id: null,
    state: 'idle',
  })
  // Reset automatically when the episode changes.
  const state = status.id === episode.id ? status.state : 'idle'

  // The study steps need the episode's words: add its deck on first use.
  const study = async (page: 'study' | 'play') => {
    if (!srs.decks.includes(episode.id)) {
      setStatus({ id: episode.id, state: 'loading' })
      try {
        await addEpisodeDeck(episode)
      } catch {
        setStatus({ id: episode.id, state: 'error' })
        return
      }
      setStatus({ id: episode.id, state: 'idle' })
    }
    navigate(`vocab/${page}/${episode.id}/lesson`)
  }

  const press = (step: LessonStep) => {
    if (step === 'preview') study('study')
    else if (step === 'review') study('play')
    else onListen()
  }

  return (
    <div className='space-y-2'>
      <ol className='flex flex-wrap items-center gap-1.5' aria-label='Vòng học bài này'>
        {LESSON_STEPS.map((step, index) => {
          const done = progress?.[step] !== undefined
          const loading = state === 'loading' && (step === 'preview' || step === 'review')
          return (
            <li key={step}>
              <button
                type='button'
                onClick={() => press(step)}
                disabled={loading}
                aria-current={step === next ? 'step' : undefined}
                className={classNames(
                  'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border transition-colors disabled:opacity-60',
                  step === next
                    ? 'bg-rose-500 text-white border-rose-500 hover:bg-rose-600'
                    : done
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30 dark:hover:bg-emerald-500/25'
                      : 'bg-white/50 text-zinc-600 border-zinc-200 hover:bg-white dark:bg-zinc-800/50 dark:text-zinc-300 dark:border-zinc-700 dark:hover:bg-zinc-800',
                )}
              >
                {loading ? (
                  <Loader2 size={12} className='animate-spin' />
                ) : done ? (
                  <Check size={12} />
                ) : (
                  <span className='tabular-nums'>{index + 1}</span>
                )}
                {LABELS[step]}
              </button>
            </li>
          )
        })}
      </ol>
      {(next === 'listen' || next === 'relisten') && (
        <button
          type='button'
          onClick={() => markLesson(episode.id, next)}
          className='text-xs font-medium text-zinc-500 underline underline-offset-2 hover:text-rose-600 dark:text-zinc-400 dark:hover:text-rose-400'
        >
          Đã nghe xong
        </button>
      )}
      {state === 'error' && (
        <p className='text-xs text-zinc-500 dark:text-zinc-400'>Bài này chưa có từ vựng</p>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Wire it into `src/App.tsx`**

- Replace `import EpisodeVocabButton from './components/vocab/EpisodeVocabButton'` with `import LessonSteps from './components/LessonSteps'`.
- Change `import { getSrsState, updateSettings, useSrs } from './lib/srsStore'` to `import { getSrsState, listenedTo, updateSettings, useSrs } from './lib/srsStore'`.
- After `const [isPlaying, setIsPlaying] = useState(false)`, add:

```ts
  // Bumped by the lesson bar's Nghe / Nghe lại (see AudioPlayer's playRequest).
  const [playRequest, setPlayRequest] = useState(0)
```

- Replace `<EpisodeVocabButton episode={currentEpisode} />` with:

```tsx
                <LessonSteps
                  episode={currentEpisode}
                  onListen={() => setPlayRequest((n) => n + 1)}
                />
```

- On `<AudioPlayer …>`, after `onPlayingChange={setIsPlaying}`, add:

```tsx
                onEnded={listenedTo}
                playRequest={playRequest}
```

- [ ] **Step 3: Delete the old button**

```bash
git rm src/components/vocab/EpisodeVocabButton.tsx
grep -rn "EpisodeVocabButton" src
```

Expected: grep prints nothing. If any comment still names it, point it at `LessonSteps` instead.

- [ ] **Step 4: Verify**

Run: `npm run format && npm run typecheck && npm run lint && npm run build`
Expected: all exit 0.

In the app, on an episode never studied:
- the bar shows ① Xem trước (rose, current), ② Nghe, ③ Ôn, ④ Nghe lại;
- press ② Nghe while paused → the episode plays from 0:00;
- "Đã nghe xong" shows only while the current (rose) step is Nghe or Nghe lại — e.g. not on a fresh episode, where the current step is Xem trước;
- seek near the end and let it finish → ② gets ✓ and the current step moves on (without "Tự chuyển bài" moving the ✓ to the next episode: it is marked for the episode that ended);
- "Đã nghe xong" marks the current listening step;
- on an episode with no vocab file, pressing Xem trước shows "Bài này chưa có từ vựng".

- [ ] **Step 5: Commit**

```bash
git add src/components/LessonSteps.tsx src/App.tsx
git commit -m "feat: four-step lesson bar on the episode page

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Sessions opened from the lesson bar

**Files:**
- Modify: `src/components/vocab/VocabApp.tsx`
- Modify: `src/components/vocab/GameSession.tsx` (`SessionProps` lives here)
- Modify: `src/components/vocab/StudySession.tsx`
- Modify: `src/components/vocab/SessionSummary.tsx`

- [ ] **Step 1: `SessionSummary` exit label**

In `SessionSummary.tsx`, add an optional prop `exitLabel?: string` to the component's props (next to `onExit`), pass it to both `<Screen …>` usages as `exitLabel={exitLabel}`, add `exitLabel?: string` to `ScreenProps`, take it in `Screen`'s destructuring, and render the button text as:

```tsx
        {exitLabel ?? 'Về khu vườn'}
```

- [ ] **Step 2: `SessionProps` and the route**

In `GameSession.tsx`, extend `SessionProps`:

```ts
export interface SessionProps {
  episodeId: number | null
  episode: Episode | undefined
  /** Opened from the episode page's lesson bar: the step the session completes. */
  lessonStep?: 'preview' | 'review'
  onExit: () => void
}
```

In `VocabApp.tsx`:
- Update the route comment to list `#vocab/study/<episodeId>/lesson` and `#vocab/play/<episodeId>/lesson`.
- Change `const [, page, param] = route.split('/')` to `const [, page, param, mode] = route.split('/')`.
- In the `study`/`play` branch, replace the `<Session … />` element with:

```tsx
    const lessonStep = mode === 'lesson' ? (page === 'play' ? 'review' : 'preview') : undefined
    return (
      <Shell>
        <Session
          // A new scope is a new session: remount rather than patch state.
          key={route}
          episodeId={episodeId}
          episode={episodes.find((e) => e.id === episodeId)}
          lessonStep={lessonStep}
          // From the lesson bar, back to the episode page it came from.
          onExit={() => navigate(lessonStep ? '' : 'vocab')}
        />
      </Shell>
    )
```

(keep the existing `const episodeId = …` and `const Session = …` lines above it).

- [ ] **Step 3: Mark the step on the summary — `StudySession.tsx`**

- Add `markLesson` to the `srsStore` import: `import { buildQueue, markLesson, rateCard, useSrs } from '../../lib/srsStore'`.
- Change the signature to `export default function StudySession({ episodeId, episode, lessonStep, onExit }: SessionProps) {`.
- After the auto-speak `useEffect`, add:

```ts
  // From the lesson bar: reaching the summary with at least one answer completes the step.
  const finished = !card
  useEffect(() => {
    if (finished && lessonStep && episodeId !== null && stats.answers > 0) {
      markLesson(episodeId, lessonStep)
    }
  }, [finished, lessonStep, episodeId, stats.answers])
```

- Change the summary return to:

```tsx
    return (
      <SessionSummary
        stats={stats}
        onExit={onExit}
        exitLabel={lessonStep ? 'Về bài nghe' : undefined}
      />
    )
```

- [ ] **Step 4: Mark the step on the summary — `GameSession.tsx`**

- Add `markLesson` to the `srsStore` import: `import { buildQueue, getSrsState, markLesson, rateCard, useSrs } from '../../lib/srsStore'`.
- Change the signature to `export default function GameSession({ episodeId, episode, lessonStep, onExit }: SessionProps) {`.
- After the Escape-key `useEffect` (before `if (!round) {`), add:

```ts
  // From the lesson bar: reaching the summary with at least one answer completes the step.
  const finished = round !== null && round.question === null
  useEffect(() => {
    if (finished && lessonStep && episodeId !== null && stats.answers > 0) {
      markLesson(episodeId, lessonStep)
    }
  }, [finished, lessonStep, episodeId, stats.answers])
```

- Change the summary return (`if (!card || !question) { … }`) to:

```tsx
    return (
      <SessionSummary
        stats={stats}
        onExit={onExit}
        exitLabel={lessonStep ? 'Về bài nghe' : undefined}
      />
    )
```

- [ ] **Step 5: Verify**

Run: `npm run format && npm run typecheck && npm run lint && npm run build`
Expected: all exit 0.

In the app, on episode 1:
- press ① Xem trước → flashcards for episode 1 open; finish them → summary button reads "Về bài nghe"; press it → back on the podcast page with ① ✓;
- Esc / the header's exit mid-session → back on the podcast page, ① not marked if no card was answered;
- press ③ Ôn → the game opens; finish → ③ ✓, back on the page; ④ Nghe lại is now current, and playing to the end marks it;
- from Vườn từ vựng (not the bar), sessions still exit to the garden with "Về khu vườn".

- [ ] **Step 6: Commit**

```bash
git add src/components/vocab/VocabApp.tsx src/components/vocab/GameSession.tsx src/components/vocab/StudySession.tsx src/components/vocab/SessionSummary.tsx
git commit -m "feat: lesson bar sessions mark their step and return to the episode

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Done mark in the episode list

**Files:**
- Modify: `src/components/EpisodeList.tsx`

- [ ] **Step 1: Implement**

- Change the lucide import to `import { CircleCheck, PlayCircle, Search } from 'lucide-react'`.
- Add `import { nextLessonStep, useSrs } from '../lib/srsStore'`.
- At the top of the component, add `const srs = useSrs()`.
- Inside the `filtered.map`, after `const current = ep.id === currentId`, add:

```ts
          const loopDone = nextLessonStep(srs.lessons[ep.id]) === null
```

- Replace the `<h3 …>{ep.title}</h3>` element with:

```tsx
                  <div className='flex items-center gap-1.5'>
                    <h3
                      className={classNames(
                        'min-w-0 text-sm font-medium truncate transition-colors',
                        current
                          ? 'text-indigo-700 dark:text-indigo-200'
                          : 'text-zinc-700 dark:text-zinc-300',
                      )}
                    >
                      {ep.title}
                    </h3>
                    {loopDone && (
                      <CircleCheck
                        size={14}
                        aria-label='Đã xong vòng học'
                        className='shrink-0 text-emerald-500'
                      />
                    )}
                  </div>
```

- [ ] **Step 2: Verify and commit**

Run: `npm run format && npm run typecheck && npm run lint && npm run build`
Expected: all exit 0. In the app, the episode whose four steps are done shows a green check after its title in the sidebar; long titles still truncate.

```bash
git add src/components/EpisodeList.tsx
git commit -m "feat: check mark on episodes whose lesson loop is done

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Full verification

- [ ] **Step 1: All checks**

Run each, from the repo root unless noted:

```bash
node scripts/verify_srs_store.js
node scripts/verify_highlight.js
node scripts/verify_examples.js
node scripts/verify_quiz.js
npm run typecheck && npm run lint && npm run format:check && npm run build
cd server && pnpm typecheck && pnpm smoke
```

Expected: every script prints its "passed" line; build and lint exit 0; smoke prints `All checks passed` (or report that the DB was unreachable).

- [ ] **Step 2: Drive the app end to end**

Use the `run` skill. On a fresh episode: Xem trước → back → Nghe to the end (seek near the end) → Ôn → back → Nghe lại to the end; confirm each ✓, the sidebar check, the highlight colours changing after the review (seed → sprout), the word popover, the line translate card, a narrow (375px) window where the bar wraps, and dark mode. If signed in on two browsers, confirm the steps sync.

- [ ] **Step 3: Report**

Summarise what passed, anything that could not run (e.g. smoke without a DB), and the production deployment note from Task 2.

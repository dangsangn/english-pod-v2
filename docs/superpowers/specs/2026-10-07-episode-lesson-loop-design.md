# Vòng học quanh một bài (đợt B)

Ngày: 2026-10-07

## Mục tiêu

Đợt A đưa câu ví dụ vào từ vựng. Đợt này nối việc học từ với việc nghe bài: mỗi bài có
một vòng bốn bước (xem trước → nghe → ôn → nghe lại) hiện ngay trên trang bài, tiến độ
được lưu và sync; trong transcript, từ vựng của bài được tô theo giai đoạn của thẻ và
bấm vào để nghe, xem nghĩa.

Đợt trước: [A — học từ trong ngữ cảnh](2026-10-06-vocab-in-context-design.md). Đợt sau:
C (timestamp từng dòng, audio gốc), D (sprint / combo).

## Quyết định đã chốt

| Câu hỏi | Quyết định |
| --- | --- |
| Vòng học hiện ở đâu | Thanh bốn bước trên trang bài, thay nút "Học từ vựng bài này". Không có trang riêng. |
| Tiến độ | Lưu và sync. Bảng mới `lessons`, mỗi bước là một mốc thời gian; gộp bằng max từng trường. |
| Nghe xong khi nào | Tự đánh dấu khi audio phát tới cuối, cộng nút "Đã nghe xong". |
| Highlight | Tô theo giai đoạn thẻ; bấm để đọc và mở thẻ nhỏ (từ, IPA, nghĩa, giai đoạn). |
| Xem trước / Ôn | Xem trước = `StudySession` theo bài; Ôn = `GameSession` theo bài. Xong khi tới màn tổng kết với ít nhất một câu trả lời. |
| Thứ tự bước | Không khoá; bước gợi ý tiếp theo được tô đậm. |
| Làm lại vòng | Không có (Nghe lại luôn bấm được). Đặt lại tiến độ toàn bộ thì xoá cả vòng học. |

## 1. Dữ liệu và sync

### Client: `src/lib/srsStore.ts`

```ts
export type LessonStep = 'preview' | 'listen' | 'review' | 'relisten'
export const LESSON_STEPS: LessonStep[] = ['preview', 'listen', 'review', 'relisten']
/** Mốc (ms) lúc mỗi bước xong; thiếu = chưa xong. */
export type LessonProgress = Partial<Record<LessonStep, number>>

SrsState.lessons: Record<number, LessonProgress>   // theo episodeId

/** Ghi mốc cho bước; bước đã có mốc thì giữ nguyên. */
export function markLesson(episodeId: number, step: LessonStep, now = Date.now()): void
/** Bước đầu tiên chưa xong theo LESSON_STEPS; xong hết thì null. */
export function nextLessonStep(p: LessonProgress | undefined): LessonStep | null
/** Gộp hai bản: max từng trường, bỏ mốc nhỏ hơn resetAt. Hàm thuần. */
export function mergeLesson(a: LessonProgress | undefined, b: LessonProgress | undefined, resetAt: number | null): LessonProgress
```

- `migrate` điền `lessons: {}` cho state cũ.
- `collectSrsChanges(since)`: thêm `lessons`, gồm các bài có mốc lớn nhất `>= since`
  (hoặc tất cả khi `since === null`). Không cần tombstone: mốc chỉ tăng.
- `applySyncResult`: `lessons[id] = mergeLesson(local, remote, resetAt)`. Khi nhận
  `resetAt` mới hơn, mọi bài đi qua `mergeLesson` để bỏ mốc cũ; bài không còn mốc nào bị xoá khỏi map.
- `resetProgress` xoá `lessons`.
- Wire: `SrsChanges.lessons: ({ episodeId: number } & LessonProgress)[]`; `SyncResponse.changes.lessons`
  tuỳ chọn (server cũ không gửi thì coi như `[]`).

### Server

- Prisma:

  ```prisma
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

  Kèm migration `20261007000000_lessons`; `User` thêm `lessons Lesson[]`.
- `schema.ts`: `lessonSchema = { episodeId: int, preview?, listen?, review?, relisten?: ms }`;
  request `lessons: z.array(lessonSchema).max(1000).default([])`. Client cũ không gửi → `[]`.
- `service.ts`:
  - `upsertLessons`: gộp các dòng trùng `episodeId` trong request bằng max từng trường; bỏ
    mốc `< resetAt`; `INSERT … ON CONFLICT (user_id, episode_id) DO UPDATE SET
    previewed_at = GREATEST(l.previewed_at, EXCLUDED.previewed_at), …, rev = nextval('sync_rev')`
    (Postgres `GREATEST` bỏ qua NULL).
  - `applyReset`: khi reset mới, `UPDATE lessons SET` từng cột `= NULL` nếu `< reset`, bump `rev`.
  - `pull`: thêm `lessons` có `rev > cursor` cộng các bài vừa đẩy lên (giống decks); tính
    vào cursor. `pushedKeys` thêm `lessonEpisodeIds`.
- `wire.ts`: `WireLesson`, `toWireLesson` (cột null → bỏ trường); `SyncResponse.changes.lessons`.

## 2. Thanh bước: `src/components/LessonSteps.tsx`

Thay `EpisodeVocabButton` dưới tiêu đề bài trong `App.tsx`. Props:
`{ episode, onListen: () => void }`.

- Bốn chip ngang (xuống dòng được trên màn hẹp): ① Xem trước ② Nghe ③ Ôn ④ Nghe lại.
  - Đã xong: dấu ✓, màu emerald.
  - Bước gợi ý (`nextLessonStep`): nền rose đậm.
  - Còn lại: viền nhạt. Bước nào cũng bấm được.
- **Xem trước / Ôn**: thêm bộ từ nếu chưa có (chuyển logic của `EpisodeVocabButton`, kể cả
  trạng thái loading và lỗi "Bài này chưa có từ vựng"), rồi
  `navigate('vocab/study/<id>/lesson')` hoặc `navigate('vocab/play/<id>/lesson')`.
- **Nghe / Nghe lại**: gọi `onListen` — App phát audio của bài từ đầu nếu đang không phát.
- Khi bước gợi ý là `listen` hoặc `relisten`: dưới thanh có nút nhỏ "Đã nghe xong" →
  `markLesson(id, step)`.
- `EpisodeVocabButton.tsx` bị xoá.

### Tự đánh dấu khi nghe xong

- `AudioPlayer` thêm prop `onEnded?: (episodeId: number) => void`, gọi đầu `handleEnded`
  (trước nhánh loop / chuyển bài tiếp), với `episode.id` của bài vừa hết.
- `AudioPlayer` thêm cách để App yêu cầu phát từ đầu: prop `playRequest: number` (tăng mỗi lần
  bấm chip Nghe); khi đổi, đặt `currentTime = 0` và `play()` nếu đang dừng.
- `App.tsx` xử lý `onEnded(id)` qua hàm `listenedTo(id)` trong `srsStore`:
  - chưa có `listen` → đánh dấu `listen`;
  - đã có `review` mà chưa có `relisten` → đánh dấu `relisten`;
  - còn lại không làm gì.

### Session mở từ thanh bước

- `VocabApp` đọc đoạn thứ tư của hash (`vocab/study/<id>/lesson`), truyền
  `lessonStep: 'preview' | 'review' | undefined` vào `StudySession` / `GameSession` (thêm
  vào `SessionProps`).
- Lần đầu tới `SessionSummary` với `stats.answers >= 1` và có `lessonStep`: gọi
  `markLesson(episodeId, lessonStep)`.
- `onExit` khi có `lessonStep`: `navigate('')` (về trang bài) thay cho `navigate('vocab')`.

### Danh sách bài

`EpisodeList` hiện ✓ nhỏ (emerald) cạnh bài có đủ bốn mốc.

## 3. Highlight trong transcript

### Hàm thuần: `src/lib/highlightVocab.ts`

```ts
export interface HitRange { start: number; end: number; word: string }
/** Vị trí từ vựng trong một dòng thoại (chuỗi đã normalizeText). */
export function findHits(line: string, entries: VocabEntry[]): HitRange[]
/** Bọc các hit trong .dialogue-block .line .text bằng <mark class="vocab-hit" data-card>. */
export function highlightVocab(root: HTMLElement, entries: VocabEntry[]): number
```

- `findHits`: với mỗi mục có `ex` và `exHit`, tìm `ex` trong `line` (so khớp sau khi đổi `’`
  thành `'`, độ dài giữ nguyên nên vị trí không lệch); trong đoạn đó lấy `exHit` bằng
  `hitIndex` của `quiz.ts`. Câu `written` không có trong thoại thì không ra hit. Các hit chồng
  nhau: giữ hit bắt đầu sớm hơn (bằng nhau thì dài hơn).
- `highlightVocab`: với mỗi `.text`, chuẩn hoá khoảng trắng trong các text node trước (giống
  `normalizeText`, để vị trí khớp), gọi `findHits`, rồi bọc từng đoạn bằng `TreeWalker` (chia text
  node khi cần). `data-card = cardId(entry.word)`, `data-word = entry.word`. Gọi lại an toàn: gỡ
  `mark.vocab-hit` cũ trước.
- `Transcript` gọi nó sau `decorateVocab`, trước `addLineTranslateButtons`.

### Màu theo giai đoạn

- Effect riêng trong `Transcript`, phụ thuộc `srs.cards` và nội dung đã dựng: đặt
  `data-stage` (`seed|sprout|bud|bloom`, theo `stageOf`) và `data-leech` (theo `isLeech`) lên
  từng `mark`; thẻ không có trong vườn thì bỏ `data-stage`. Ôn xong là màu đổi, không dựng lại transcript.
- CSS trong `index.css`, có dark mode:
  - không có `data-stage`: gạch chân chấm nhạt;
  - seed / sprout / bud / bloom: nền nhạt theo màu của `STAGES` (amber / lime / pink / rose);
  - `data-leech`: viền dưới đỏ 2px.

### Bấm vào từ: `src/components/WordPopover.tsx`

- Bấm `mark.vocab-hit`: `speak(word)` và mở popover dựng trên `FloatingCard` (rộng 288).
- Nội dung: từ + IPA + nút loa; `vi` — `viDef`; `StageBadge` và `LeechBadge` nếu có thẻ,
  không có thì "Chưa học". Dữ liệu lấy từ thẻ trong store, không có thì từ `VocabEntry` của bài.
- `Transcript` giữ một trạng thái popover duy nhất cho cả popover dịch dòng lẫn popover từ:
  mở cái này thì cái kia đóng.

## Cấu trúc code

| File | Thay đổi |
| --- | --- |
| `src/lib/srsStore.ts` | `lessons`, `markLesson`, `listenedTo`, `nextLessonStep`, `mergeLesson`, sync. |
| `src/lib/sync.ts` | Nếu cần: chuyển `lessons` theo wire format. |
| `src/lib/highlightVocab.ts` | Mới. |
| `src/components/LessonSteps.tsx` | Mới; thay `EpisodeVocabButton.tsx` (xoá). |
| `src/components/WordPopover.tsx` | Mới. |
| `src/components/Transcript.tsx` | Highlight, màu, popover từ. |
| `src/components/AudioPlayer.tsx` | `onEnded`, `playRequest`. |
| `src/components/EpisodeList.tsx` | ✓ bài đã xong vòng. |
| `src/App.tsx` | `LessonSteps`, nối `onEnded` / `playRequest`. |
| `src/components/vocab/VocabApp.tsx`, `StudySession.tsx`, `GameSession.tsx` | `lessonStep`, về trang bài. |
| `src/index.css` | `.vocab-hit`. |
| `server/prisma/schema.prisma` + migration | `Lesson`. |
| `server/src/sync/schema.ts`, `service.ts`, `wire.ts` | `lessons`. |
| `scripts/verify_highlight.js` | Mới. |
| `scripts/verify_srs_store.js` | Thêm lessons. |
| `server/scripts/smoke.ts` | Thêm lessons. |

## Kiểm tra

Dự án không dùng test framework. Kiểm tra bằng:

- `node scripts/verify_highlight.js`: trên cả 365 bài (dòng thoại đọc bằng
  `scripts/lib/transcripts.js`), mọi mục `src:"dialogue"` ra đúng một hit trong đúng một dòng,
  và chuỗi tại hit bằng `exHit`; không có hit chồng nhau.
- `node scripts/verify_srs_store.js`: `mergeLesson` (max từng trường, bỏ mốc `< resetAt`),
  `nextLessonStep`, `markLesson` không ghi đè, `listenedTo` theo ba trường hợp,
  `collectSrsChanges` / `applySyncResult` với lessons.
- `server/scripts/smoke.ts`: hai thiết bị đẩy lessons khác nhau cho cùng bài rồi kéo về thấy
  bản gộp; reset xoá mốc cũ.
- `npm run build` và lint qua (cả server).
- Chạy app: đi đủ một vòng (xem trước → về trang bài; nghe tới cuối → ✓ tự hiện; ôn; nghe
  lại), màu từ đổi sau khi ôn, bấm từ mở popover và đọc, popover dịch dòng vẫn chạy, ✓ trong
  danh sách bài, màn hình hẹp, dark mode.

## Ngoài phạm vi

- Timestamp từng dòng, nhảy audio tới dòng chứa từ (đợt C).
- Làm lại vòng cho một bài, thống kê vòng học.
- Highlight câu `written` (không có trong thoại).

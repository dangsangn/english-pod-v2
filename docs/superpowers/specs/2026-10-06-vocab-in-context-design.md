# Học từ trong ngữ cảnh (đợt A)

Ngày: 2026-10-06

## Mục tiêu

Từ vựng hiện được học tách khỏi bài thoại, và phần "nghe" chỉ là TTS đọc từng từ.
Đợt này đưa câu ví dụ vào mọi từ, thêm hai kiểu câu hỏi dựa trên câu (cloze, chép
chính tả), tăng độ khó theo giai đoạn của thẻ, giới hạn từ mới mỗi ngày và đánh dấu
từ hay quên.

Đây là đợt đầu trong bốn đợt:

| Đợt | Nội dung |
| --- | --- |
| **A (spec này)** | Câu ví dụ, cloze, chép chính tả, độ khó theo giai đoạn, giới hạn từ mới, từ hay quên |
| B | Vòng học quanh một bài (xem trước → nghe → ôn → nghe lại), highlight từ trong transcript |
| C | Timestamp từng dòng thoại bằng forced alignment, câu hỏi nghe dùng audio gốc |
| D | Sprint / combo (cần chốt lại vì spec game cũ để ngoài phạm vi) |

## Quyết định đã chốt

| Câu hỏi | Quyết định |
| --- | --- |
| Nguồn câu ví dụ | Câu thoại gốc nếu có; không có thì soạn sẵn một câu ngắn. Mọi câu đều có bản dịch tiếng Việt. |
| Lưu câu ví dụ ở đâu | Trong file từ vựng từng bài (`public/vocab/englishpod_XXXX.json`), tải khi cần. Thẻ trong store và giao thức sync không đổi. |
| Chép chính tả | Gõ cả câu, chấm từng từ; điểm SRS chỉ dựa vào từ mục tiêu. |
| Giới hạn từ mới | Setting `newPerDay`, mặc định 15, có sync. Chỉ áp dụng khi ôn toàn vườn. |
| Từ hay quên | `lapses ≥ 4`. Chỉ huy hiệu, bộ lọc và luôn hiện câu ví dụ; không có ghi chú mẹo nhớ. |

## 1. Dữ liệu câu ví dụ

### Nguồn soạn tay: `scripts/data/vocab-ex/NNNN.jsonl`

Mỗi file gom 20 bài theo `ep` (`0001.jsonl` = bài 1–20, …, `0019.jsonl` = bài 361–365). Mỗi dòng:

```json
{"w":"go with","d":"to choose, pick","ex":"I'll go with the spaghetti and meatballs, salad and the wine.","hit":"go with","src":"dialogue","ep":1,"vi":"Tôi sẽ chọn mì spaghetti thịt viên, salad và rượu vang."}
```

| Trường | Ý nghĩa |
| --- | --- |
| `w`, `d` | Từ và định nghĩa tiếng Anh; khoá giống vocab-vi (`vocabKey(w, d)`), vì một từ có thể có nhiều nghĩa. |
| `ex` | Đúng **một** câu tiếng Anh. |
| `hit` | Chuỗi đúng như xuất hiện trong `ex` (có thể là dạng biến thể: "grabbed" cho "grab"). Là phần bị che trong cloze. |
| `src` | `dialogue` (lấy từ thoại của chính bài đó) hoặc `written` (soạn mới). |
| `ep` | Bài chứa câu (với `dialogue`) hoặc bài đầu tiên có cặp từ này (với `written`); quyết định file. |
| `vi` | Bản dịch tiếng Việt của cả câu. |

### Script trích câu: `scripts/extract_examples.js`

Chạy một lần để tạo bản nháp, không ghi đè dòng đã có trong file đích.

1. Đọc phần thoại (`.dialogue-block .line .text`) và các mục từ vựng của từng bài.
2. Với mỗi mục, tìm dòng thoại khớp:
   - **Khớp chính xác:** từ (bỏ phần trong ngoặc như "(someone)") xuất hiện nguyên văn, có ranh giới từ, không phân biệt hoa thường, `’` coi như `'`.
   - **Khớp lỏng:** từng từ trong cụm khớp theo gốc (bỏ tối đa 2 ký tự cuối, tối thiểu 3 ký tự), đúng thứ tự, cách nhau tối đa 2 từ. Kết quả ghi thêm `"check":true` để soát tay.
3. Dòng thoại dài được cắt theo câu (`.`, `?`, `!`), chỉ giữ câu chứa `hit`.
4. Ưu tiên dòng ngắn nhất trong các dòng khớp.
5. Không khớp: ghi dòng với `ex`, `hit`, `vi` rỗng và `src:"written"` để soạn.

### Soạn tay

- Câu `written`: một câu tự nhiên, 6–14 từ, ngữ cảnh gần với chủ đề bài, dùng đúng nghĩa `d`.
- Dòng `"check":true`: xác nhận `hit` đúng là từ đó với nghĩa đó (không phải trùng chữ), sửa hoặc chuyển sang `written`, rồi xoá `check`.
- `vi` cho mọi dòng: dịch tự nhiên, không dịch từng chữ.
- Làm theo từng file (25 file), song song bằng subagent; mỗi file soạn xong phải qua `verify_examples.js`.

### Build: `scripts/build_vocab.js`

Gộp vào mỗi mục trong file JSON từng bài ba trường mới: `ex`, `exHit`, `exVi`. Thêm vào
`VocabEntry` trong [src/types.ts](../../../src/types.ts) dạng tuỳ chọn. Mục thiếu dữ liệu
ví dụ vẫn được ghi (khác với vocab-vi): app coi như không có câu ví dụ.

### Kiểm tra: `scripts/verify_examples.js`

Báo lỗi và thoát mã khác 0 nếu:

- Thiếu dòng cho một mục từ vựng, hoặc có dòng thừa không khớp mục nào.
- `ex`, `hit` hoặc `vi` rỗng; còn `check`.
- `hit` không nằm trong `ex` (phân biệt hoa thường để cloze cắt đúng chỗ).
- `src:"dialogue"` mà `ex` không còn là một phần của một dòng thoại trong bài.
- `ex` có nhiều hơn một câu (có dấu kết câu ở giữa theo sau là chữ hoa).

## 2. Tải câu ví dụ trong app: `src/lib/examples.ts`

```ts
export interface Example { ex: string; hit: string; vi: string }
export function loadExamples(episodeIds: number[]): Promise<void>
export function exampleOf(card: Pick<Card, 'id' | 'episodeIds'>): Example | null
/** true khi file của mọi bài trong episodeIds đã tải xong (hoặc lỗi). */
export function useExamples(episodeIds: number[]): boolean
export function episodeIdsOf(cards: (Pick<Card, 'episodeIds'> | undefined)[]): number[]
```

- Tải `./vocab/<transcript_id>.json` của các bài cần, cache theo bài trong module (không lưu
  localStorage). Lỗi mạng: bỏ qua, thẻ coi như không có ví dụ.
- Tra theo `cardId(entry.word)`; thẻ thuộc nhiều bài dùng bài đầu tiên trong `episodeIds`
  có ví dụ.
- `GameSession` và `StudySession` gọi `loadExamples` cho các bài của thẻ trong hàng đợi
  trước khi hiện câu đầu tiên (hiện trạng thái chờ ngắn). Câu hỏi được tạo sau khi tải
  xong, nên `makeQuestion` nhận `example` đồng bộ.

## 3. Kiểu câu hỏi theo giai đoạn

Thêm `cloze` và `dictation` vào `QuestionKind` trong [quiz.ts](../../../src/lib/quiz.ts).
`QuizCard` có thêm `lapses`, `interval`; `makeQuestion` nhận thêm `example: Example | null`.

`allowedKinds(card, { canSpeak, hasExample })` theo `stageOf(card)`:

| Giai đoạn | Kiểu |
| --- | --- |
| seed | meaning, listen |
| sprout | meaning, listen, spell |
| bud | listen, spell, cloze |
| bloom | cloze, dictation |

Lọc như cũ (`listen` cần `canSpeak`; `meaning`, `spell` cần nghĩa), thêm: `cloze` cần
ví dụ và nghĩa; `dictation` cần ví dụ và `canSpeak`. Nếu sau khi lọc không còn kiểu nào,
lấy kiểu của giai đoạn liền trước (bloom → bud → sprout → seed) cho tới khi có. Luật
không quá 2 lần liên tiếp cùng kiểu giữ nguyên.

### Cloze: `ClozeQuestion.tsx`

- Hiện câu `ex` với `hit` thay bằng ô chữ (dùng lại `SpellQuestion` với các prop tuỳ chọn `target`, `label`, `prompt`, `spoken`, `example`), nghĩa tiếng Việt của từ (`meaningOf`)
  bên trên làm gợi ý.
- Gợi ý, Kiểm tra, Bỏ qua, thử lại 1 lần: y như Điền từ; chấm bằng `checkSpelling(input, hit)`
  và `gradeFor` như cũ.
- Sau khi có kết quả: hiện câu đầy đủ (hit in đậm), `vi`, từ gốc + IPA, đọc cả câu.

### Chép chính tả: `DictationQuestion.tsx`

- Luôn tự đọc câu khi hiện (đây là câu nghe, giống `listen`), nút loa đọc lại, nút 🐢 đọc chậm.
  `speak(text, { rate })` thêm tham số, mặc định 0.8 như hiện tại; chậm là 0.55.
- Một `<textarea>` một dòng (Enter để kiểm tra), tắt autocorrect/autocapitalize/spellcheck.
- Chấm bằng hàm thuần `gradeDictation(input, ex, hit)` trong `quiz.ts`:
  - Tách từ: `comparable` từng từ (chữ thường, bỏ dấu câu; `’` → `'`, giữ `'` trong từ).
  - Căn hai dãy bằng LCS; mỗi từ của câu đúng là `ok` hoặc `missed`, mỗi từ thừa
    của người học là `extra`.
  - `targetCorrect`: mọi từ thuộc `hit` đều `ok`.
  - Trả về `{ words: {text, status}[], targetCorrect, accuracy }`.
- Chỉ một lần kiểm tra. Hiện câu đúng với từ `missed` tô đỏ, từ `ok` xanh, `hit` gạch chân;
  dưới là `vi` và độ chính xác (%).
- Mức SRS: `targetCorrect` → `good`, ngược lại → `again`. Bấm Bỏ qua → `again`.

## 4. Flashcard

Mặt sau, dưới phần Definition: khối "Ví dụ" gồm câu `ex` (dùng `TappableText`, `hit`
in đậm), nút loa đọc cả câu, và `vi`. Không có ví dụ thì không hiện khối.

## 5. Giới hạn từ mới mỗi ngày

- `Settings.newPerDay: number | null` (null = không giới hạn), mặc định 15. `migrate` điền
  mặc định cho state cũ.
- `buildQueue(s, now, episodeId)`: khi `episodeId === null`, chỉ lấy
  `max(0, newPerDay − days[today].learned)` thẻ mới. Theo bài thì giữ nguyên.
  Nhánh "ôn trước hạn" khi hàng đợi rỗng giữ nguyên.
- `summarize` thêm `freshToday` (số thẻ mới còn được học hôm nay); `VocabHome` dùng nó
  cho mục tiêu, nút Học và dòng mô tả thay cho `seed`. Hết lượt từ mới thì ghi "Đã đủ
  N từ mới hôm nay".
- Settings trên trang chính: chọn 5 / 10 / 15 / 20 / 30 / Không giới hạn.
- Sync: thêm `newPerDay` vào `settingsSchema` (zod, `z.number().int().min(1).max(999).nullable().default(15)`),
  `wire.ts`, `service.ts`, cột `new_per_day Int? @default(15)` trong Prisma kèm migration.
  Client cũ không gửi trường này thì server giữ mặc định.

## 6. Từ hay quên

- `isLeech(card)` trong `srs.ts`: `card.lapses >= 4` (hằng `LEECH_LAPSES`).
- Huy hiệu "Hay quên" cạnh `StageBadge` trên flashcard và trong hàng của `WordList`.
- `WordList` thêm bộ lọc "Hay quên" bên cạnh các bộ lọc giai đoạn (`#vocab/words/leech`).
- Game: với thẻ hay quên, phần hiện đáp án của mọi kiểu câu hỏi luôn có câu ví dụ.

## Cấu trúc code

| File | Thay đổi |
| --- | --- |
| `scripts/extract_examples.js` | Mới: tạo bản nháp `vocab-ex`. |
| `scripts/data/vocab-ex/*.jsonl` | Mới: dữ liệu câu ví dụ. |
| `scripts/build_vocab.js` | Gộp `ex`, `exHit`, `exVi`. |
| `scripts/verify_examples.js` | Mới. |
| `scripts/verify_quiz.js` | Thêm cloze, dictation, `gradeDictation`, `allowedKinds` theo giai đoạn. |
| `src/types.ts` | `VocabEntry` thêm trường tuỳ chọn. |
| `src/lib/examples.ts` | Mới. |
| `src/lib/quiz.ts` | Kiểu mới, `allowedKinds` theo giai đoạn, `gradeDictation`. |
| `src/lib/srs.ts` | `isLeech`. |
| `src/lib/srsStore.ts` | `newPerDay`, `buildQueue`, `summarize.freshToday`, sync settings. |
| `src/lib/speech.ts` | `speak(text, { rate })`. |
| `src/components/vocab/SpellQuestion.tsx` | Thêm prop tuỳ chọn để Cloze dùng lại. |
| `src/components/vocab/ExampleSentence.tsx`, `LeechBadge.tsx` | Mới. |
| `src/components/vocab/ClozeQuestion.tsx`, `DictationQuestion.tsx` | Mới. |
| `scripts/lib/transcripts.js`, `scripts/lib/examples.js` | Mới: đọc transcript, dữ liệu ví dụ (dùng chung cho các script). |
| `src/components/vocab/GameSession.tsx`, `StudySession.tsx` | Tải ví dụ, kiểu mới. |
| `src/components/vocab/Flashcard.tsx`, `WordList.tsx`, `VocabHome.tsx` | Ví dụ, hay quên, giới hạn từ mới. |
| `server/prisma/schema.prisma` + migration, `server/src/sync/*` | `newPerDay`. |

## Kiểm tra

Dự án không dùng test framework. Kiểm tra bằng:

- `node scripts/verify_examples.js` sạch lỗi trên cả 25 file.
- `node scripts/verify_quiz.js`: thêm kiểm tra cloze (`checkSpelling(hit, hit)` đúng với mọi mục),
  `gradeDictation(ex, ex, hit)` cho `targetCorrect` và `accuracy = 1` với mọi mục, một số ca
  tay (thiếu từ, thừa từ, sai từ mục tiêu), `allowedKinds` cho từng giai đoạn.
- `npm run build` và lint qua.
- `server/scripts/smoke.ts` qua với `newPerDay`.
- Chạy app: chơi đủ 5 kiểu (dùng thẻ được chỉnh state để ra từng giai đoạn), xem ví dụ trên
  flashcard, đổi giới hạn từ mới và kiểm tra hàng đợi, bộ lọc Hay quên, màn hình hẹp.

## Ngoài phạm vi

- Audio gốc của câu (đợt C), vòng học quanh bài và highlight transcript (đợt B), sprint (đợt D).
- Ghi chú mẹo nhớ cho từ hay quên.
- Nhận diện giọng nói.

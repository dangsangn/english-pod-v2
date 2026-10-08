# 1000 từ phổ biến nhất trong hội thoại

Ngày: 2026-10-08

## Mục tiêu

Ngoài từ vựng theo từng bài, người học cần một bộ từ nền tảng: 1000 từ nội dung xuất hiện
nhiều nhất trong hội thoại tiếng Anh. Bộ này được học như mọi deck khác (flashcard, game,
lịch ôn SRS, sync), mỗi từ kèm IPA, nghĩa tiếng Việt, một câu ví dụ (ưu tiên câu thoại
EnglishPod), 2–3 từ đồng nghĩa và 2–3 cụm từ thông dụng (collocation).

## Quyết định đã chốt

| Câu hỏi | Quyết định |
| --- | --- |
| Nguồn danh sách | Kết hợp: NGSL 1.2 làm gốc, xếp hạng lại theo tần suất trong hội thoại EnglishPod. |
| Cách dùng | Học bằng SRS: 10 deck × 100 từ theo thứ hạng. |
| Từ chức năng (*the, a, is, I, of…*) | Loại bỏ; 1000 từ đều là từ nội dung (danh, động, tính, trạng từ). |
| Cụm từ | Đợt này: mỗi từ kèm 0–3 cụm thông dụng có nghĩa tiếng Việt, chỉ hiển thị (trường `col`). Deck "Cụm từ phổ biến" học bằng SRS là spec riêng, làm sau. |
| Tích hợp deck | Dải ID số riêng `10001–10010` trong không gian deck hiện có. Không đổi server, DB, sync. |
| Từ đồng nghĩa | Chỉ hiển thị, 0–3 từ cho đúng nghĩa chính. Không có câu hỏi game mới, không dịch/IPA riêng. |
| Thẻ trùng giữa deck bài và Top 1000 | Nội dung Top 1000 thắng, tiến độ giữ nguyên. |
| Phạm vi nội dung đợt đầu | Pipeline + UI đầy đủ; soạn nhóm 1 (100 từ) để duyệt chất lượng, 9 nhóm còn lại làm sau. |

## 1. Xếp hạng: `scripts/rank_core.js`

### Nguồn

- `scripts/data/ngsl/NGSL_12_stats.csv`: thứ hạng NGSL 1.2 (cột `Lemma`, `SFI Rank`; 2809 từ).
- `scripts/data/ngsl/NGSL_12_lemmatized_for_teaching.csv`: mỗi dòng là headword rồi các dạng
  biến đổi (`go,goes,went,going,gone,goin,gonna`); dòng bắt đầu bằng `##` là chú thích.
- Cả hai tải từ newgeneralservicelist.com, giấy phép CC BY-SA 4.0. Ghi công trong
  `scripts/data/ngsl/README.md` và trên trang chọn bộ từ của app.
- `scripts/data/ngsl/function-words.json`: danh sách headword bị loại (mạo từ, đại từ, giới
  từ, liên từ, trợ động từ/động từ khuyết thiếu, từ hạn định, số đếm, thán từ như *oh, yeah*).

### Thuật toán

1. Đọc NGSL, bỏ headword nằm trong `function-words.json`. Gọi số còn lại là `N`, thứ hạng NGSL
   của mỗi headword trong tập này là `ngslRank` (1…N).
2. Dựng bảng `dạng → headword` từ file lemmatized. Một dạng thuộc nhiều headword thì gán cho
   headword có `ngslRank` nhỏ nhất.
3. Với mọi dòng thoại của 365 bài (`readEpisodeItems`/parser trong `scripts/lib/transcripts.js`,
   chỉ phần `.dialogue-block .text`), tách từ bằng cùng quy tắc chuẩn hoá của
   một quy tắc tách từ chung (`wordTokens` trong `scripts/lib/core.js`): chữ cái, cho phép một
   dấu nháy bên trong; bỏ token kết thúc bằng *n't* (đều là trợ động từ phủ định, và *won't*
   không được tính thành *win*); token có nháy lấy phần trước nháy (*dad's* → *dad*, *I'm* → *I*).
   Đếm `count[headword]`.
4. `epRank`: thứ hạng theo `count` giảm dần trong N headword; headword có `count = 0` đều nhận
   `epRank = N`.
5. `score = ngslRank / N + epRank / N`; nhỏ hơn là phổ biến hơn. Hoà điểm thì `ngslRank` nhỏ
   hơn đứng trước.
6. Lấy 1000 headword điểm thấp nhất, xếp theo `score`. Hạng 1–100 vào nhóm 1, …, 901–1000 vào
   nhóm 10.

### Chọn câu ví dụ

Với mỗi từ có `count > 0`, chọn một câu thoại chứa một dạng của từ đó:

- Ưu tiên câu đã có bản dịch trong `scripts/data/dialogue-vi/` (để có sẵn `exVi`).
- Rồi ưu tiên câu dài 5–15 từ; trong cùng mức, câu ngắn hơn trước, rồi bài số nhỏ hơn.
- Nếu dòng thoại có nhiều câu, cắt lấy câu chứa từ (cùng cách tách câu với `extract_examples.js`).
  Khi cắt câu thì `exVi` không còn khớp, nên để trống để soạn tay.
- Ghi `hit` = dạng đúng như trong câu (*went* cho *go*) và `ep` = số bài.

### Đầu ra: bản nháp `scripts/data/core-vi/NN.jsonl`

`01.jsonl` … `10.jsonl`, mỗi file 100 dòng theo thứ hạng:

```json
{"rank":12,"w":"buy","n":214,"ex":"I want to buy a new phone.","hit":"buy","ep":42,"exVi":"Tôi muốn mua một cái điện thoại mới.","d":"","vi":"","vd":"","syn":[],"col":[],"colHint":["buy a (12)","buy it (9)"],"viHint":[]}
```

- `n` = số lần xuất hiện trong EnglishPod (để tham khảo).
- `colHint`: gợi ý cụm cho người soạn, không được build ra. Với mỗi lần một dạng của từ xuất hiện
  trong một câu thoại, đếm mọi cụm 2–4 từ liên tiếp chứa nó (chữ thường, giữ dạng rút gọn như
  *don't*). Bỏ cụm mở đầu hoặc kết thúc bằng từ chức năng, trừ các tiểu từ *up, out, off, down,
  over, back, away, on, in, about, around* (để giữ *figure out*); bỏ cụm gặp dưới 3 lần. Lấy 5
  cụm nhiều nhất (hoà thì cụm dài hơn trước), dạng `"make sure (41)"`. Luôn tính lại khi chạy.
- `col`: soạn tay, 0–3 cụm `{"en":"make sure","vi":"đảm bảo"}`. Ưu tiên cụm trong `colHint` nếu
  tự nhiên; được viết cụm khác khi cụm thông dụng không có trong EnglishPod.
- Các trường soạn tay: `d` (định nghĩa tiếng Anh ngắn cho nghĩa chính), `vi`, `vd`, `syn`, `col`, và
  `ex`/`hit`/`exVi` khi chưa có (từ không xuất hiện trong EnglishPod, hoặc câu cần dịch).
  Câu soạn tay thì không có `ep`.
- `viHint`: các nghĩa mà từ vựng của các bài đã dạy cho từ này (tối đa 3, dạng
  `"famous for, easily recognized → nổi tiếng về"`). Nghĩa trong bài thường hẹp hoặc là nghĩa phụ,
  nên chỉ là gợi ý; `vi`/`vd` luôn bắt đầu rỗng. Luôn tính lại khi chạy, không được build ra.
- Chạy lại an toàn: dòng đã có trường soạn tay (theo `w`) được giữ nguyên các trường đó; chỉ
  `rank`, `n` và nhóm được cập nhật. Từ rơi khỏi top 1000 bị bỏ và in ra để biết.
- Script in tóm tắt ngắn: 30 từ đầu, số từ không có câu thoại, số từ đã điền sẵn từ dữ liệu cũ.
  Không in cả danh sách.

## 2. Build: `scripts/build_core.js`

- Đọc `scripts/data/core-vi/NN.jsonl`, ghi `public/core/core_NN.json` (mảng `VocabEntry`).
- Một nhóm chỉ được ghi khi cả 100 dòng đã có `d`, `vi`, `vd`, `ex`, `hit`, `exVi` và `hit` nằm
  trong `ex`. Thiếu file là
  trạng thái "chưa xong" bình thường, giống `public/vocab/`.
- IPA lấy bằng `loadCmudict`/`ipaFor` mà `build_vocab.js` đã export (CMUdict +
  `vocab-ipa-overrides.json`); không cần tách file.
- `type` để trống (NGSL không có từ loại; không cần cho thẻ).
- Mỗi phần tử: `word, ipa, def, vi, viDef, ex, exHit, exVi`, thêm hai trường mới tuỳ chọn:
  - `syn?: string[]`: từ đồng nghĩa (bỏ trường khi rỗng).
  - `col?: {en, vi}[]`: cụm từ (bỏ trường khi rỗng). `colHint` không được build ra.
  - `exEp?: number`: bài chứa câu ví dụ.
- `src/types.ts`: thêm `syn?`, `col?` (kiểu `Collocation`) và `exEp?` vào `VocabEntry`.
- `col` không bắt buộc để một dòng được coi là xong.

### `scripts/verify_core.js`

Với mỗi file trong `scripts/data/core-vi/` (và `public/core/` nếu có):

- Tổng cộng 1000 từ, mỗi nhóm đúng 100, không trùng `cardId`, `rank` liên tục 1…1000.
- Không từ nào nằm trong `function-words.json`.
- `hit` xuất hiện trong `ex` (so sánh chính xác theo chuỗi con, phân biệt hoa thường); `ep` nếu có thì nằm trong 1–365.
- `syn` tối đa 3 phần tử, không chứa chính từ đó, không trùng nhau.
- `col` tối đa 3 phần tử; mỗi phần tử có `en` và `vi` không rỗng; `en` chứa một dạng của từ
  (theo danh sách dạng NGSL); không trùng `en`.
- Mỗi `public/core/core_NN.json` khớp với nguồn của nó (chạy `build_core.js` lại không đổi gì).

## 3. Tích hợp vào app

### `src/lib/coreDecks.ts` (mới)

```ts
export const CORE_BASE = 10000
export const CORE_GROUPS = 10
export const CORE_DECK_IDS = [10001, …, 10010]
export function isCoreDeck(id: number): boolean   // 10001 ≤ id ≤ 10010
export function coreGroup(id: number): number     // 1…10
export function coreDeckName(id: number): string  // "Top 1000 · 101–200"
export function vocabFile(id: number): string     // core: ./core/core_02.json, bài: ./vocab/englishpod_0042.json
```

`vocabFile` thay cho mọi chỗ đang tự ghép tên file từ số bài (`examples.ts`, `srsStore.ts`:
`addEpisodeDeck`, `backfillCardContent`).

### Store (`src/lib/srsStore.ts`)

- `addDeckById(id)`: tải `vocabFile(id)` (cho mọi deck, bài hay Top 1000) rồi gọi `addDeck(id, entries)`. Ném lỗi khi file chưa
  có (nhóm chưa soạn xong).
- `addDeck`/`removeDeck`/`summarize`/`buildQueue` không đổi: ID core chỉ là một số deck khác.
- Thẻ dùng chung theo `cardId`; khi thêm deck Top 1000, thẻ đã có được cập nhật sang nội dung của
  Top 1000 (nghĩa phổ biến), giữ nguyên tiến độ; thêm deck bài vào thẻ đã có thì giữ nội dung
  hiện có — nên nội dung Top 1000 luôn thắng; transcript của bài không bị ảnh hưởng (nó đọc file
  vocab của bài). Xoá deck core không xoá thẻ còn
  thuộc deck khác.
- `backfillCardContent` lấy `c.episodeIds[0]` và tìm `Episode`; với ID core thì đọc thẳng
  `vocabFile(id)`, không cần `Episode`.
- `settings.lastEpisodeId` và `lessons` không bao giờ nhận ID core.

### Từ đồng nghĩa, cụm từ và câu ví dụ (`src/lib/examples.ts`)

`Example` thêm `ep?: number`. Bên cạnh cache câu ví dụ có thêm cache `syn`/`col` theo deck, đọc
bằng `synonymsOf(card)` và `collocationsOf(card)`. Hook hiện có tải file theo `vocabFile(id)` cho
mọi deck của thẻ. Thẻ có trong cả deck bài và deck core thì câu ví dụ lấy từ deck đầu tiên có câu
(như hiện nay), còn `syn`/`col` lấy từ deck đầu tiên có chúng. Không lưu gì lên thẻ, nên sync,
server và DB không đổi.

Server: `episode_id`/`episode_ids` là `Int` và zod trong `server/src/sync/schema.ts` chỉ kiểm
`z.number().int()` (không giới hạn ≤ 365), nên nhận 10001–10010 sẵn. Server không đổi gì.

## 4. Giao diện

- **DeckBrowser** (`#vocab/decks`): thêm mục **"1000 từ phổ biến"** ở trên danh sách bài, 10
  dòng `coreDeckName(id)` với nút thêm/bỏ như deck bài. Nhóm chưa có file hiện "Đang soạn" và
  nút bị khoá (biết bằng lỗi 404 khi thêm, giống "Bài này chưa có từ vựng").
- **VocabHome**: chỗ nào liệt kê deck theo số bài thì dùng `coreDeckName` cho ID core; nút mở
  bài (`onOpenEpisode`) không hiện với ID core. `#vocab/episode/<id>` với ID core hiện danh sách
  từ của nhóm (WordList) như một deck bài, tiêu đề là `coreDeckName`.
- **Flashcard (mặt sau)**: khi có `syn` thì thêm khối *Synonyms: purchase, get, pick up*. Câu
  ví dụ có `ep` thì ghi nhỏ "Trích từ bài N" (chữ thường, vì phiên học không có `onOpenEpisode`).
- **Flashcard (mặt sau)**: khi có `col` thì thêm khối *Collocations*, mỗi dòng "make sure —
  đảm bảo".
- **WordList**: mở một dòng từ thì hiện thêm đồng nghĩa, cụm từ và câu ví dụ (tải file của các deck chứa
  thẻ đó, chỉ khi mở); "Trích từ bài N" ở đây là link mở bài.
- Không thêm kiểu câu hỏi game nào; game chạy với deck core như deck bài.
- Ghi công NGSL (CC BY-SA 4.0) dưới tiêu đề mục "1000 từ phổ biến" trong DeckBrowser.

## 5. Kiểm tra

- `node scripts/verify_core.js`.
- `scripts/verify_core_decks.js` (mới, giả lập `fetch`): thêm deck core; thẻ trùng với deck bài dùng chung một
  thẻ và giữ tiến độ; xoá deck core giữ thẻ của deck bài; `vocabFile` cho ID bài và ID core; `exampleOf`/`synonymsOf`/`collocationsOf`.
- Chạy toàn bộ `scripts/verify_*.js`, `pnpm typecheck`, `pnpm lint`, `pnpm build`.
- Chạy app: thêm nhóm 1, học vài thẻ, chơi một lượt game, thấy đồng nghĩa, cụm từ và link "Bài N";
  đăng nhập và sync trên hai trình duyệt thấy deck core xuất hiện ở cả hai.

## Ngoài phạm vi

- Deck "Cụm từ phổ biến" (cụm động từ, collocation, câu cửa miệng là thẻ SRS riêng, khai thác
  bằng n-gram): spec riêng sau đợt này, dùng lại pipeline.
- Câu hỏi game về cụm từ.
- Câu hỏi game về từ đồng nghĩa; IPA/nghĩa cho từ đồng nghĩa.
- Trang tra cứu 1000 từ riêng (ngoài WordList của từng nhóm).
- Nội dung nhóm 2–10 (làm sau khi duyệt nhóm 1, cùng pipeline).

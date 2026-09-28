# Trò chơi ôn từ vựng

Ngày: 2026-09-28

## Mục tiêu

Ngoài flashcard, cho người học ôn từ bằng ba kiểu câu hỏi chủ động hơn:

1. **Chọn nghĩa**: hiện từ tiếng Anh, chọn nghĩa tiếng Việt đúng trong 4 đáp án.
2. **Điền từ**: hiện nghĩa tiếng Việt, gõ từ tiếng Anh vào các ô `_ _ _`.
3. **Nghe → chọn từ**: app đọc to từ, chọn đúng từ tiếng Anh trong 4 từ tiếng Anh.

Kết quả mỗi câu được chấm vào lịch ôn (SRS) giống như một lần chấm flashcard.

## Quyết định đã chốt

| Câu hỏi | Quyết định |
| --- | --- |
| Có tính vào lịch ôn không? | Có. Mỗi câu gọi `rateCard` như flashcard. |
| Phạm vi chơi | Cả hai: toàn vườn (từ đến hạn và từ mới) và theo từng bài nghe. |
| Trộn các kiểu câu hỏi? | Có, trong cùng một lượt chơi. |
| Vị trí so với flashcard | Chế độ riêng, nút "Chơi" cạnh nút "Học". Flashcard giữ nguyên. |
| Từ mới | Chỉ gặp câu dễ (Chọn nghĩa, Nghe). Điền từ chỉ dành cho từ đã học ít nhất một lần. |

## Dữ liệu sẵn có

Mỗi thẻ trong `srsStore` có `word`, `ipa`, `type`, `def` (nghĩa tiếng Anh),
`vi` (nghĩa tiếng Việt), `viDef`, `episodeIds`, `state`. Nhiều mục là cụm từ
("still working on", "go with"), nên ô chữ và cách so đáp án phải xử lý được
khoảng trắng và dấu câu. Không cần dữ liệu hay backend mới.

## Luồng người dùng

- Trang chính vườn từ: nút **Chơi** cạnh **Học** → `#vocab/play`.
- Mỗi bài trong danh sách: nút **Chơi** cạnh nút học bài → `#vocab/play/<episodeId>`.
- Cần ít nhất 4 thẻ trong vườn (mọi bài cộng lại) để có đủ đáp án. Nếu ít hơn, nút
  **Chơi** bị mờ và có tooltip "Cần ít nhất 4 từ trong vườn".
- Hàng đợi dùng `buildQueue(srs, now, episodeId)`, giống flashcard. Hết hàng đợi
  thì hiện `SessionSummary`.

## Chọn kiểu câu hỏi cho mỗi thẻ

`allowedKinds(card, { canSpeak })` lọc kiểu hợp lệ, `pickKind(kinds, recentKinds)` chọn một,
`makeQuestion` ghép lại và dựng câu hỏi:

- `card.state === 'new'` → ngẫu nhiên giữa `meaning` và `listen`.
- Còn lại → ngẫu nhiên giữa `meaning`, `spell`, `listen`.
- Loại `listen` nếu trình duyệt không có `speechSynthesis`.
- Loại `meaning` và `spell` nếu thẻ không có cả `vi` lẫn `def`.
- Không cho một kiểu xuất hiện quá 2 lần liên tiếp (nếu còn kiểu khác hợp lệ).
- Nếu không còn kiểu nào hợp lệ (trình duyệt không đọc được và thẻ không có nghĩa)
  thì bỏ thẻ khỏi lượt chơi, không chấm; thẻ vẫn học được bằng flashcard.

Chữ hiển thị làm nghĩa là `vi`, không có thì dùng `def`.

## Câu hỏi chọn đáp án (Chọn nghĩa và Nghe)

`buildChoices(card, pool, field)` trả về 4 phương án đã xáo trộn và vị trí đáp án đúng.

- `field` là `'meaning'` (so theo `vi || def`) hoặc `'word'`.
- Thứ tự ưu tiên lấy đáp án sai: cùng bài với thẻ → cùng `type` → mọi thẻ khác trong vườn.
- Bỏ phương án có giá trị chuẩn hoá (chữ thường, bỏ dấu câu, gộp khoảng trắng)
  trùng với đáp án đúng hoặc trùng nhau.
- Với `meaning`: bỏ thêm phương án có một nghĩa con (tách bằng `,` hoặc `;`) trùng với
  một nghĩa con của đáp án đúng.
- Không đủ 3 đáp án sai thì hiện ít hơn (tối thiểu 2 phương án).

Giao diện `ChoiceQuestion`:

- `meaning`: hiện từ + IPA + nút loa.
- `listen`: tự đọc từ khi hiện câu (theo cơ chế `speak` sẵn có), nút loa lớn để nghe lại;
  không hiện chữ cho tới khi trả lời.
- Chọn bằng chạm hoặc phím 1–4. Sau khi chọn: đáp án đúng tô xanh, đáp án đã chọn nếu
  sai tô đỏ, hiện từ, IPA, nghĩa. Nút **Tiếp** (Enter/Space) sang câu sau.

## Câu hỏi Điền từ

`maskWord(word)` chia cụm thành từng từ (tách theo khoảng trắng), mỗi từ là dãy token: chữ
cái (một ô, có `index` trong chuỗi chữ cái) hoặc ký tự khác như `'` `-` `.` (hiện sẵn, không
phải gõ). Mỗi từ không bị ngắt dòng ở giữa.

`checkSpelling(input, word)`: so sau khi chuẩn hoá (chữ thường, `’` → `'`, bỏ các ký tự
không phải chữ cái). Đúng khi chuỗi chữ cái khớp hoàn toàn.

Giao diện `SpellQuestion`:

- Hiện nghĩa tiếng Việt lớn; nghĩa tiếng Anh (`def`) nhỏ bên dưới.
- Hàng ô chữ; một `<input>` ẩn nhận bàn phím (hoạt động trên điện thoại), chữ gõ vào
  lấp lần lượt các ô chữ cái.
- **Gợi ý**: điền đúng chữ cái kế tiếp chưa đúng.
- **Kiểm tra** (Enter): đúng → xanh, hiện IPA và đọc từ. Sai lần đầu → rung, xoá phần
  gõ (giữ chữ gợi ý), cho thử lại. Sai lần hai hoặc bấm **Bỏ qua** → hiện đáp án.
- Sau khi có kết quả, nút **Tiếp** sang câu sau.

## Quy ra mức ôn

`gradeFor(result)`:

| Kết quả | Mức |
| --- | --- |
| Đúng ngay lần đầu, không gợi ý | `good` |
| Điền từ đúng nhưng đã dùng gợi ý hoặc sai 1 lần | `hard` |
| Sai (chọn sai, hoặc điền sai 2 lần, hoặc bỏ qua) | `again` |

Không dùng `easy`. Thẻ chưa lên `review` sau khi chấm được xếp lại sau 3 thẻ
(`REQUEUE_GAP`), giống `StudySession`. Thống kê lượt chơi (`answers`, `forgotten`,
`learned`) tính như flashcard để `SessionSummary` dùng lại được.

## Cấu trúc code

| File | Vai trò |
| --- | --- |
| `src/lib/quiz.js` | Hàm thuần: `allowedKinds`, `pickKind`, `buildChoices`, `makeQuestion`, `maskWord`, `checkSpelling`, `gradeFor`. Nhận `rng` để kiểm tra được. |
| `src/components/vocab/GameSession.jsx` | Hàng đợi, chọn kiểu câu, gọi `rateCard`, requeue, thống kê. |
| `src/components/vocab/ChoiceQuestion.jsx` | Câu Chọn nghĩa và Nghe. |
| `src/components/vocab/SpellQuestion.jsx` | Câu Điền từ. |
| `src/components/vocab/SessionHeader.jsx` | Nút thoát, thanh tiến độ, bộ đếm mới/đang học/cần ôn, tách ra từ `StudySession` để hai màn dùng chung. |
| `src/components/vocab/VocabApp.jsx` | Thêm route `play`. |
| `src/components/vocab/VocabHome.jsx` | Thêm nút **Chơi**. |

Câu hỏi của thẻ đang hiện được tạo một lần khi thẻ lên đầu hàng đợi (lưu trong state theo
`turn`), không tạo lại mỗi lần render.

## Kiểm tra

Dự án không dùng test framework. Kiểm tra bằng:

- `scripts/verify_quiz.js`: nạp toàn bộ `scripts/data/vocab-vi/*.jsonl`, với mỗi bài coi các
  từ là thẻ, chạy `buildChoices` (cả hai `field`) và `maskWord`/`checkSpelling` cho từng từ,
  báo lỗi nếu: ít hơn 4 phương án khi bài có ≥ 4 từ, phương án trùng nhau sau chuẩn hoá,
  đáp án đúng không nằm trong danh sách, hoặc `checkSpelling(word, word)` trả về sai.
- Mở app, chơi thử cả ba kiểu câu ở `#vocab/play` và một bài cụ thể, kiểm tra lịch ôn cập
  nhật (số thẻ đến hạn trên trang chính thay đổi), phím tắt, và giao diện trên màn hình hẹp.

## Ngoài phạm vi

- Tính điểm, chuỗi thắng, bảng xếp hạng.
- Tuỳ chỉnh tỉ lệ các kiểu câu hỏi.
- Nhận diện giọng nói (người học tự đọc).

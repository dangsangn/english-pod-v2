# IPA và bản dịch tiếng Việt cho từ vựng

Ngày: 2026-07-31

## Mục tiêu

Ở hai mục `Key Vocabulary` và `Supplementary Vocabulary` của mỗi transcript,
hiển thị thêm phiên âm IPA và bản dịch tiếng Việt cho từng mục từ.

## Bối cảnh: tính năng này từng tồn tại rồi bị gỡ

`TRANSLATION_FEATURE.md` và `PRONUNCIATION_APIS.md` mô tả một hệ thống fetch API
lúc runtime (Free Dictionary → Wiktionary cho IPA, MyMemory cho bản dịch). Hệ
thống đó **không còn trong code**:

| Commit | Tác động lên `Transcript.jsx` |
| --- | --- |
| `db4d4c3` add feature for english pod | +461 dòng (thêm tính năng) |
| `e17d863` fix some bug ui | −80 dòng |
| `6f99606` update ui and ux for load list | −279 dòng (gỡ nốt phần fetch) |

Hiện `Transcript.jsx` chỉ còn gắn nút click-to-speak bằng Web Speech API. Hai
class CSS `.word .pronunciation` và `.definition .translation` vẫn còn nguyên
trong `src/index.css` — chỉ thiếu dữ liệu và phần chèn.

Hai tài liệu trên giờ mô tả sai hệ thống, sẽ bị xoá và thay bằng spec này.

## Khảo sát dữ liệu

| Chỉ số | Giá trị |
| --- | --- |
| Tổng mục từ vựng (365 bài) | 4.638 |
| Mục có `word` rỗng (bỏ qua) | 19 |
| Từ/cụm duy nhất | 4.003 |
| **Cặp (từ, definition) duy nhất** | **4.533** |
| Từ đơn / cụm nhiều chữ | 2.472 / 1.531 (38% là cụm) |
| Trung bình mỗi bài | 12,7 mục |

Phân bố số nghĩa trên mỗi từ: 3.574 từ có 1 nghĩa, 351 từ có 2, 61 từ có 3, 13
từ có 4, 2 từ có 5, 2 từ có 6.

### Vì sao đơn vị dịch là cặp (từ, definition)

429 từ mang nhiều definition khác nhau, và một phần là nghĩa thật sự khác chứ
không phải diễn đạt lại:

- `complimentary` → "free" **và** "expressing a compliment"
- `check out` → "pay and leave a hotel" **và** "look at something that is attractive"

Nếu key theo từ, bài dùng nghĩa "khen ngợi" sẽ hiện "miễn phí". Do đó dịch theo
cặp. IPA thì vẫn gắn theo từ vì phát âm không đổi theo nghĩa.

### Nguồn IPA: CMUdict offline, không dùng API

| Nguồn | Kết quả đo (2026-07-31) |
| --- | --- |
| `api.dictionaryapi.dev` | Cloudflare chặn ở ~45 request song song: `error code: 1015`, sau đó HTTP 429 |
| **CMUdict** (126.052 mục) | Phủ đủ toàn bộ token cho **3.843/4.003 = 96,0%** |

Chi tiết CMUdict: 96,0% đủ token, 0,8% đủ một phần, 3,2% không có. Nhóm không có
phần lớn là lỗi chính tả trong dữ liệu gốc (`akwardness`, `availablity`,
`aminister`) và từ hiếm/ngoại lai (`asiago`, `apres-ski`).

### Nguồn dịch: không dùng MyMemory

Đo thực tế 4 mẫu:

| Từ | MyMemory trả về | Đánh giá |
| --- | --- | --- |
| grab | túm lấy, vồ, chộp lấy | đạt |
| still working on | Vẫn còn đang làm. | tạm |
| complimentary *(def: free)* | sự biếu | sai nghĩa |
| pull your weight | Này, đồ của ông đấy. | sai hoàn toàn |

Với 38% dữ liệu là cụm từ, chất lượng này không dùng được. Transcript đã có sẵn
definition tiếng Anh cho từng mục, nên bản dịch được soạn dựa trên
`từ + loại từ + definition + tên bài` thay vì tra từ trần trụi.

## Quyết định

Người dùng chọn:

- **Nguồn dịch:** Claude soạn trực tiếp trong phiên làm việc, kết quả commit
  thành dữ liệu tĩnh. Không API key, không phụ thuộc dịch vụ ngoài lúc chạy.
- **Phạm vi dịch:** cả từ lẫn definition.
- **Phạm vi triển khai:** ban đầu định làm 50 bài đầu (653 cặp) rồi duyệt chất
  lượng mới chạy tiếp. Người dùng quyết định làm nốt luôn, nên đợt này phủ
  **toàn bộ 365 bài — 4.619 mục, 4.533 cặp duy nhất**.

## Thiết kế

### 1. Dữ liệu sinh ra: một file cho mỗi bài

`public/vocab/englishpod_0001.json`, đặt cạnh `public/transcripts/` sẵn có. Mảng
theo **đúng thứ tự** các `.vocab-item` trong file HTML tương ứng:

```json
[
  { "word": "grab", "ipa": "ɡræb", "vi": "chộp lấy", "viDef": "lấy nhanh, vơ lấy" },
  { "word": "complimentary", "ipa": "ˌkɑːmpləˈmentəri", "vi": "miễn phí", "viDef": "được tặng kèm, không tính tiền" }
]
```

Chia theo bài thay vì một file tổng: file tổng nặng 856 KB thô / 112 KB gzip và
phải tải hết chỉ để xem một bài, trong khi mỗi file bài chỉ khoảng 3 KB. Cách
này cũng khớp pattern lazy-load theo bài mà app đang dùng cho transcript.

Vì file được sinh từ chính HTML đó, runtime khớp theo **chỉ số mảng** và chỉ
dùng `word` để xác nhận. Không cần chuẩn hoá chuỗi lúc chạy, nên không có rủi ro
tra trượt vì dấu ngoặc (`stand (someone) up` — 37 mục), dấu gạch chéo
(`20/20 vision` — 9 mục) hay dấu câu cuối (`how may i help you?`).

### 2. Nguồn sự thật của bản dịch

`scripts/data/vocab-vi/NNNN.jsonl` — mỗi dòng một cặp:

```
{"w":"complimentary","d":"free","vi":"miễn phí","vd":"được tặng kèm, không tính tiền"}
```

Mỗi file 200 cặp. JSONL vì mỗi lô là một lần ghi, resume được giữa chừng, và
diff theo dòng dễ đọc. Trọn bộ 4.533 cặp nằm trong 24 file (`0001`–`0024`).

Khoá tra là cặp `(w, d)` đã lowercase và gộp khoảng trắng.

Về chính tả: đặt dấu thanh **kiểu cũ** — `hòa`, `thủy`, `khỏe`, `hóa`, `tòa`,
không phải `hoà`, `thuỷ`, `khoẻ`. Lô đầu viết kiểu cũ, các lô sau lỡ viết kiểu
mới nên nhìn lệch hẳn khi đọc liền mạch; đã sửa lại toàn bộ cho thống nhất. Chỉ
áp dụng cho âm tiết mở: `hoàn`, `chuyển` vốn giống nhau ở cả hai kiểu, và sau
`qu` thì kiểu cũ vẫn là `quý`, `quỹ`, `quỵ`. Toàn bộ dữ liệu ở dạng Unicode NFC.

### 3. `scripts/build_vocab.js`

Một lệnh, chạy lại được nhiều lần, cùng phong cách với
`scripts/build_audio_sources.js`:

1. Đọc 365 file HTML, trích `(word, type, definition)` theo thứ tự xuất hiện
2. Tải CMUdict vào thư mục cache đã gitignore, dựng bảng ARPAbet → IPA kèm dấu
   trọng âm (`1` → `ˈ`, `2` → `ˌ`); cụm từ ghép IPA từng chữ
3. Tra `scripts/data/vocab-ipa-overrides.json` **trước** CMUdict, cho những mục
   CMUdict không giải được hoặc giải sai; vẫn thiếu thì để `ipa` rỗng
4. Ghép bản dịch từ `scripts/data/vocab-vi/`
5. Ghi `public/vocab/englishpod_XXXX.json`
6. **In ra danh sách cặp chưa có bản dịch**, để soạn tiếp theo lô

Bước 6 là điểm mấu chốt: cho phép vừa soạn vừa dựng, không phải soạn xong hết
mới biết còn thiếu gì.

File override thay cho ý ban đầu là gọi Wiktionary: 152 mục cần bù đều là tiếng
lóng, từ mượn, tên riêng hoặc **lỗi chính tả trong dữ liệu gốc**
(`naseous`, `availablity`, `bizzard`) — Wiktionary cũng chịu, mà soạn tay thì
xong hẳn và không phải gọi mạng lúc dựng. Riêng chữ viết tắt đọc từng ký tự
(`ER`, `BP`, `DUI`, `SUV`) phải có override vì CMUdict giải chúng thành từ:
`er` ra `/ɚ/`, tiếng ngập ngừng, chẳng liên quan gì tới phòng cấp cứu.

Cờ `--episodes=1-50` giới hạn phạm vi khi cần dựng lại một khoảng.

### 4. `scripts/verify_vocab.js`

- Mọi `.vocab-item` trong phạm vi phải có đúng một entry, đúng thứ tự
- Bản dịch phải phủ 100% phạm vi; thiếu thì thoát mã 1 và liệt kê đích danh
- Báo tỉ lệ phủ IPA và liệt kê các mục thiếu IPA
- Bắt trùng khoá `(w, d)` giữa các file lô
- Bắt chuỗi rỗng và khoảng trắng thừa ở `w`, `vi`, `vd`. Riêng `d` được phép
  rỗng: bài 194 có hai mục (`Fortune Cookie`, `Chow Mein`) mà thẻ definition
  trong HTML gốc để trống, khoá phải khớp đúng như vậy

Không gộp mục thiếu vào một con số tổng rồi bỏ qua.

### 5. Runtime

**`src/lib/vocabulary.js`** (mới) — `decorateVocab(rootEl, entries)`: duyệt
`.vocab-item`, chèn `<span class="pronunciation">` vào `.word` và
`<span class="translation">` vào `.definition`. Tách riêng để `Transcript.jsx`
không phình.

**`src/components/Transcript.jsx`** — thêm một lời gọi SWR
`./vocab/${transcript_id}.json`, cùng điều kiện `isVisible` như transcript. File
thiếu thì bỏ qua im lặng: transcript vẫn hiển thị bình thường, chỉ không có IPA
và bản dịch. Bốn bài không có mục từ vựng nào nên cũng không có file — bỏ qua im
lặng là đúng cho chúng, và cho cả trường hợp về sau thêm transcript mới.

Tiện thể sửa một lỗi cấu trúc sẵn có: hiện có hai `useEffect` cùng deps
`[content, loading]`, effect thứ hai phải `setTimeout(150ms)` để chờ effect thứ
nhất gán xong `innerHTML` (`Transcript.jsx:63`). Đó là race chờ may rủi. Gộp
thành một effect: gán `innerHTML` rồi trang trí ngay, bỏ hẳn timeout.

Hiển thị, dùng đúng CSS đang có (`.pronunciation` và `.translation` đều là
`display: block`):

```
grab                    get quickly
/ɡræb/                  chộp lấy — lấy nhanh, vơ lấy
```

Giữ nguyên nút click-to-speak bằng Web Speech API.

### 6. Dọn tài liệu sai

Xoá `TRANSLATION_FEATURE.md` và `PRONUNCIATION_APIS.md`. Chúng mô tả kiến trúc
đã bị gỡ khỏi code và giờ gây hiểu nhầm. Spec này thay thế.

## Kiểm chứng

`node scripts/verify_vocab.js` trên toàn bộ 365 bài, kết quả thực tế:

| Chỉ số | Kết quả |
| --- | --- |
| Mục từ vựng trong phạm vi | 4.619 |
| Mục có bản dịch | 4.619 (100%) |
| Mục có IPA | 4.619 (100%) |
| File bài được ghi | 361 (4 bài không có mục từ vựng nào) |
| Dòng trong `scripts/data/vocab-vi/` | 4.533 |
| Sai lệch giữa transcript và file sinh ra | 0 |

Ghi lại số liệu thật, không nói suông.

Chưa chạy kiểm chứng trong trình duyệt: người dùng bỏ bước đó. Phần runtime
(`decorateVocab` + lời gọi SWR trong `Transcript.jsx`) mới chỉ được đọc lại chứ
chưa xác nhận bằng mắt trên trang thật.

## Ngoài phạm vi (YAGNI)

- Dịch lời thoại trong `dialogue-block`
- Đọc bản dịch tiếng Việt bằng TTS
- Nút bật/tắt bản dịch, lưu vào localStorage
- Đa ngôn ngữ
- Fetch API lúc runtime dưới mọi hình thức

## Rủi ro đã biết

Bản dịch do Claude soạn, không có người bản ngữ rà lại. Với từ chuyên ngành hoặc
thành ngữ hiếm có thể lệch sắc thái. Ban đầu định làm 50 bài rồi duyệt chất
lượng trước, nhưng người dùng chọn làm hết luôn, nên cả 4.533 cặp đều chưa qua
vòng duyệt đó. Sửa một mục là sửa một dòng trong `scripts/data/vocab-vi/` rồi
chạy lại `build_vocab.js`, không phải dựng lại từ đầu.

IPA cũng vậy: 152 mục là do người soạn tay trong
`scripts/data/vocab-ipa-overrides.json`, phần còn lại máy sinh từ CMUdict.

Muốn dịch lại về sau thì phải nhờ Claude lần nữa — không có script tự chạy được.
Đổi lại, dữ liệu là tĩnh và commit trong repo, nên app lúc chạy không phụ thuộc
bất kỳ dịch vụ ngoài nào.

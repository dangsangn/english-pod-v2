# Chuyển nguồn audio khỏi archive.org

Ngày: 2026-07-31

## Vấn đề

365 episode trong `src/data/episodes.json` đều trỏ mp3 tới
`https://archive.org/download/englishpod_all/englishpod_XXXXpb.mp3`. Người dùng
báo audio "đôi lúc không load được".

### Chẩn đoán

Đo từ máy dev (2026-07-31):

| Host | Kết quả |
| --- | --- |
| `example.com` | 200 |
| `github.com` | 200 |
| `archive.org` (apex) | timeout |
| `web.archive.org` | timeout |
| `ia801604.us.archive.org` (data node) | 200 |
| `dn721304.ca.archive.org` (data node) | 200 |

Data node của archive.org vào được, apex `archive.org` thì không. Đây là chặn ở
tầng ISP/DNS/SNI, không phải archive.org sập.

URL `https://archive.org/download/...` bắt buộc đi qua apex để lấy redirect 302
rồi mới tới data node. Apex chết ⇒ toàn bộ audio chết. Lỗi mang tính gián đoạn
theo mạng/thời điểm, khớp với mô tả "đôi lúc".

Yếu tố làm nặng thêm: `AudioPlayer.jsx` không có handler `onError`.
`onLoadStart` bật `isBuffering`, `onCanPlay` mới tắt. Khi request lỗi thì
`onCanPlay` không bao giờ chạy, spinner quay vô tận và không có thông báo lỗi.

## Nguồn thay thế: `linyuanzky/englishpod365`

Khảo sát qua Git Tree API (`recursive=1`, không bị truncate):

| Chỉ số | Giá trị |
| --- | --- |
| Tổng file mp3 | 1078 |
| Episode được cover | 365/365 |
| Có suffix `pb` | 350 |
| Chỉ có `pr` (không `pb`) | 15 — ep 1–9, 14, 16, 17, 20, 23, 24 |
| Tổng dung lượng `pb` | 2.27 GB (trung bình 6.5 MB/bài) |
| Commit `main` tại thời điểm khảo sát | `459a08ed310883985a0fcda9d75e3f0e5f139392` |

Kiểm chứng phân phối, tải thật `englishpod_0365pb.mp3` (5,251,157 bytes):

| Nguồn | HTTP | Range | CORS | `content-type` | Tốc độ | `cache-control` |
| --- | --- | --- | --- | --- | --- | --- |
| `raw.githubusercontent.com` (pin SHA) | 200 / 206 | `accept-ranges: bytes` | `*` | `audio/mpeg` | 7.8 MB/s | `max-age=300` |
| `cdn.jsdelivr.net/gh` (pin `@main`) | 200 / 206 | có | `*` | `audio/mpeg` | 3.9 MB/s | `s-maxage=43200` |
| `cdn.jsdelivr.net/gh` (pin SHA) | 206 | có | `*` | `audio/mpeg` | — | `max-age=31536000, immutable` |

Range request hoạt động trên cả hai ⇒ tua (seek) trong player không bị ảnh hưởng.

### Ràng buộc: tên file không suy ra được bằng công thức

Tên file có tiền tố chữ cái thay đổi theo từng bài, phân bố:
`''` ×607, `C` ×195, `B` ×159, `D` ×69, `E` ×42, `F` ×6.

Ví dụ: `englishpod_B0001pr.mp3`, `englishpod_C0019pb.mp3`,
`englishpod_D0018pb.mp3`, `englishpod_0365pb.mp3`.

Không có quy luật suy từ số episode ⇒ bắt buộc sinh bảng ánh xạ từ Git Tree API.

### 15 bài thiếu `pb` — đã xác nhận

15 episode thiếu `pb` được thay bằng `pr`. Suy đoán ban đầu: `pr` là bản bài học
đầy đủ của loạt sớm, vì các bài đó chỉ có đúng `pr` + `rv` và `pr` nặng 7–15 MB
(so với `dg` chỉ ~0.4–1 MB).

Đã xác nhận sau khi triển khai: ep 1 load trong browser cho
`duration = 444.6s` (7 phút 25) — đúng độ dài một bài học đầy đủ, không phải
đoạn dialogue ngắn.

## Quyết định

Người dùng chọn:

- **Nguồn host:** trỏ thẳng repo gốc `linyuanzky/englishpod365`, không fork,
  không mirror.
- **Fallback:** có, nhiều nguồn theo thứ tự.

## Thiết kế

### 1. Tầng dữ liệu — `src/data/episodes.json`

Thêm 2 field mỗi episode, giữ nguyên `mp3` cũ làm fallback cuối:

```json
{
  "id": 1,
  "audio_path": "0001-0010/0001/englishpod_B0001pr.mp3",
  "audio_kind": "pr",
  "mp3": "https://archive.org/download/englishpod_all/englishpod_0001pb.mp3"
}
```

Lưu **path tương đối**, không lưu URL đầy đủ. Đổi host về sau chỉ sửa một hằng
số thay vì sinh lại 365 dòng.

`audio_kind` ∈ `{pb, pr}` — ghi lại vì sao bài đó dùng file nào, phục vụ việc
rà soát 15 bài đặc biệt.

Field `transcript_url` là dữ liệu chết (không component nào đọc —
`Transcript.jsx:17` đọc từ `./transcripts/` local). Không đụng tới trong phạm vi
này.

### 2. Tầng nguồn — `src/lib/audioSources.js` (file mới)

```js
const REPO = 'linyuanzky/englishpod365'
const REF  = '459a08ed310883985a0fcda9d75e3f0e5f139392'

export function getAudioSources(episode) {
  const p = episode.audio_path
  return [
    p && `https://cdn.jsdelivr.net/gh/${REPO}@${REF}/${p}`,
    p && `https://raw.githubusercontent.com/${REPO}/${REF}/${p}`,
    episode.mp3,
  ].filter(Boolean)
}
```

Hàm thuần, không phụ thuộc React ⇒ test được độc lập.

**Vì sao pin commit SHA thay vì `@main`:** jsDelivr trả `immutable,
max-age=31536000` cho URL pin SHA, so với `s-maxage=43200` cho `@main`. Lần nghe
thứ hai không tốn request nào. Ngoài ra jsDelivr giữ bản cache của chính nó, nên
nếu repo gốc bị xoá thì link vẫn sống thêm một thời gian.

**Vì sao jsDelivr đứng trước raw dù raw đo nhanh gấp đôi:** 3.9 MB/s là khoảng
1.7s cho file 6.5 MB, mà audio stream dần nên chênh lệch này không cảm nhận
được. Đổi lại jsDelivr cho cache 1 năm và là CDN công cộng đúng mục đích, còn
`raw.githubusercontent.com` có cơ chế chống lạm dụng và chỉ cache 300s.

`archive.org` giữ ở vị trí cuối — vẫn chạy được với người dùng không bị chặn.

Lưu ý về 15 bài dùng `pr`: nguồn fallback archive.org của các bài đó vẫn là file
`pb` gốc, tức nội dung có thể khác bản `pr` đôi chút. Chấp nhận được — fallback
là nỗ lực tốt nhất, không phải cam kết trả đúng cùng một file.

### 3. Tầng player — `src/components/AudioPlayer.jsx`

- Thêm state `sourceIndex`, reset về 0 khi `episode.id` đổi.
- Thêm handler `onError` trên `<audio>`:
  - còn nguồn kế ⇒ tăng `sourceIndex`, gọi `load()`, khôi phục `currentTime` đã
    lưu và trạng thái đang phát.
  - hết nguồn ⇒ vào state lỗi.
- State lỗi: tắt `isBuffering`, hiện thông báo + nút "Thử lại" (reset
  `sourceIndex` về 0). Điều này cũng vá luôn bug spinner quay vô tận.

Dùng index thủ công chứ **không** dùng nhiều thẻ `<source>`: fallback native của
browser chỉ chạy khi lỗi lúc load ban đầu, không xử lý được đứt giữa chừng, và
không kiểm soát được từ code.

Cần lưu ý `useEffect` sẵn có ở `AudioPlayer.jsx:32` (deps `[episode.id]`) tự
autoplay. Việc đổi src do fallback không được xung đột với effect này.

### 4. Script sinh dữ liệu — `scripts/build_audio_sources.js` (file mới)

Cùng phong cách với `scripts/fetch_transcripts.js` sẵn có (ESM, `node:https`,
không thêm dependency).

1. Gọi `https://api.github.com/repos/linyuanzky/englishpod365/git/trees/<ref>?recursive=1`
2. Parse path theo regex `^(\d{4}-\d{4})/(\d{4})/englishpod_([A-Za-z]*)(\d{4})([a-z]{2})\.mp3$`
3. Với mỗi episode 1..365, chọn theo thứ tự ưu tiên `pb` > `pr` > `dg`
4. Ghi `audio_path` + `audio_kind` vào `src/data/episodes.json`
5. In ra SHA đã dùng và cảnh báo nếu số episode được ánh xạ khác 365

Chạy lại nhiều lần cho cùng kết quả (idempotent).

### 5. Kiểm chứng

Script gửi HEAD tới toàn bộ 365 URL trên **cả jsDelivr lẫn raw**, in ra bảng
tổng kết số 200 / non-200 và liệt kê episode lỗi.

Tiêu chí hoàn thành: 365/365 trả 200 trên jsDelivr (nguồn chính). Nếu có bài
lỗi, phải liệt kê đích danh và nêu rõ bài đó rơi về nguồn nào — không được gộp
vào một con số tổng rồi bỏ qua.

Ngoài ra chạy app thật trong Chrome (Playwright) và chặn từng host để ép đi hết
chuỗi fallback, kiểm cả banner lỗi lẫn nút Thử lại.

### Kết quả thực tế (2026-07-31)

`node scripts/verify_audio_sources.js` — 730 URL trên 365 episode:

| Host | ok | range 206 | `audio/*` |
| --- | --- | --- | --- |
| `cdn.jsdelivr.net` | 365/365 | 365/365 | 365/365 |
| `raw.githubusercontent.com` | 365/365 | 365/365 | 356/365 |

9 file trả `application/octet-stream` thay vì `audio/mpeg` trên raw: ep 5, 6, 7,
8, 9, 14, 16, 17, 24 — toàn bộ là file `pr`. Không chặn được phát: browser sniff
byte cho media element chứ không tin header, và raw chỉ là nguồn dự phòng thứ
hai trong khi jsDelivr (nguồn chính) trả `audio/mpeg` cho cả 365. Ghi nhận chứ
không xử lý.

Chạy app trong Chrome, 13/13 kiểm tra đạt: phát được qua jsDelivr; chặn jsDelivr
thì rơi sang raw và vẫn decode được; chặn cả hai thì tới archive.org; chặn cả ba
thì hiện banner lỗi + nút Thử lại và spinner dừng hẳn; bấm Thử lại thì phục hồi
về jsDelivr; đổi episode thì chuỗi reset về nguồn đầu.

## Ngoài phạm vi (YAGNI)

- Track `dg` (dialogue) / `rv` (review) như audio phụ
- 558 file PDF trong repo đó
- Service worker / nghe offline
- Tải 2.4 GB về máy hoặc mirror sang R2 / GitHub Release
- Dọn field `transcript_url` chết

## Rủi ro đã biết

Trỏ thẳng repo của bên thứ ba: nếu `linyuanzky/englishpod365` bị xoá hoặc đổi
tên, cache jsDelivr sẽ cạn dần và app rơi về archive.org — tức quay lại tình
trạng hiện tại. Chuỗi fallback làm nhẹ chứ không xoá được rủi ro này.

Đường thoát rẻ: fork repo về account của mình rồi sửa đúng hằng số `REPO` trong
`src/lib/audioSources.js`. Vì `audio_path` là path tương đối nên không phải sinh
lại dữ liệu.

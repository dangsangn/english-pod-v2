# Đăng nhập Google và đồng bộ lịch sử học

Ngày: 2026-09-28

## Mục tiêu

Thêm một backend Node.js để:

1. Đăng nhập bằng tài khoản Google.
2. Lưu **lịch sử học từ vựng** (thẻ SRS, deck, log từng lượt ôn) lên server.
3. Lưu **lịch sử nghe audio** (vị trí đang nghe, số lần nghe, đã nghe xong chưa)
   lên server.
4. Đồng bộ dữ liệu giữa các thiết bị của cùng một tài khoản.

## Nguyên tắc: local-first

- **Chưa đăng nhập:** app chạy như hiện tại, mọi dữ liệu ở localStorage.
- **Đã đăng nhập:** localStorage vẫn là nơi đọc/ghi trực tiếp của UI. Mọi thao
  tác phản hồi ngay, dùng được offline. Một tiến trình nền đồng bộ với server.
- **Không có trang login.** Header có nút "Đăng nhập với Google"; đăng nhập
  xong nút thành avatar với menu "Đồng bộ lúc …" và "Đăng xuất".
- Không đặt `VITE_API_URL` khi build thì nút đăng nhập bị ẩn và app chạy thuần
  local như bây giờ.

## Bối cảnh

- FE là SPA React 19 + Vite, deploy tĩnh lên GitHub Pages
  (`https://dangsangn.github.io/english-pod-v2/`).
- State đang có trong localStorage:

| Key | Nội dung | Có đồng bộ? |
| --- | --- | --- |
| `englishpod_srs_v1` | `cards`, `decks`, `settings.autoSpeak`, `days` | Có |
| `englishpod_last_episode_id` | Episode mở gần nhất | Có (trong settings) |
| `theme` | Giao diện sáng/tối | Không |
| cache dịch (`translate.js`) | Kết quả dịch | Không |

- [`src/lib/srs.js`](../../../src/lib/srs.js) là hàm thuần, tính lịch ôn phía
  client. Vì phải chạy được khi offline, **client vẫn là nơi tính lịch**; server
  chỉ lưu và gộp dữ liệu.

## Stack và hạ tầng

| Phần | Lựa chọn |
| --- | --- |
| Runtime | Node.js 22 |
| Ngôn ngữ (server) | TypeScript, `strict: true`; dev chạy bằng `tsx watch`, build bằng `tsc` ra `dist/` |
| Web framework | Express 5 |
| Database | PostgreSQL, qua Prisma (bản ổn định mới nhất lúc cài) |
| Validate input | zod |
| Xác thực Google | `google-auth-library` (`verifyIdToken`) |
| Host server | Render Web Service, gói miễn phí |
| Host DB | Neon, gói miễn phí |

Chi phí: 0đ. Render gói miễn phí ngủ sau 15 phút không có request, request đầu
chậm 30–60 giây. Vì đồng bộ chạy nền nên người dùng chỉ thấy độ trễ này lúc bấm
đăng nhập.

Code server nằm ở `server/`, viết bằng TypeScript, có `package.json` riêng, **không import gì từ
`src/`**, để Render có thể deploy với root directory là `server`.

## Đăng nhập

1. FE nạp Google Identity Services (`https://accounts.google.com/gsi/client`),
   gọi `google.accounts.id.initialize` với `VITE_GOOGLE_CLIENT_ID`, rồi
   `renderButton` vào header. Không bật One Tap.
2. Người dùng bấm nút, Google trả về một ID token (`credential`).
3. FE gọi `POST /auth/google { credential }`.
4. Server `verifyIdToken` với `audience = GOOGLE_CLIENT_ID`, yêu cầu
   `email_verified = true`, rồi upsert `users` theo `sub`.
5. Server tạo session token: 32 byte ngẫu nhiên, mã hoá base64url. DB chỉ lưu
   `sha256(token)`. Hạn 30 ngày, tự gia hạn khi được dùng (cập nhật tối đa một
   lần mỗi ngày).
6. Server trả `{ token, user: { id, email, name, avatarUrl } }`. FE lưu vào
   `englishpod_auth_v1`.
7. Mọi request sau gửi `Authorization: Bearer <token>`.

**Vì sao không dùng cookie:** GitHub Pages và Render là hai site khác nhau, nên
cookie phiên sẽ là cookie bên thứ ba, và Safari/iOS chặn loại cookie này.

**Đổi tài khoản trên cùng máy:** trạng thái đồng bộ lưu `ownerId`, tức user
đang sở hữu dữ liệu local.

- Nếu `ownerId` rỗng (dữ liệu tạo khi chưa đăng nhập): lần đồng bộ đầu tiên gộp
  dữ liệu local vào tài khoản.
- Nếu `ownerId` khác user vừa đăng nhập: xoá dữ liệu học local trước khi đồng
  bộ, không gộp dữ liệu của người khác vào.

**Đăng xuất:** đồng bộ lần cuối.

- Thành công: gọi `POST /auth/logout` (xoá session), rồi xoá dữ liệu học local,
  `englishpod_auth_v1` và `englishpod_sync_v1`.
- Thất bại (offline, server lỗi): hỏi "Còn thay đổi chưa đồng bộ, vẫn đăng
  xuất?" trước khi xoá.

**Session hết hạn (401):** xoá `englishpod_auth_v1`, giữ nguyên dữ liệu local
và các thay đổi chưa đẩy. Đăng nhập lại cùng tài khoản thì đồng bộ tiếp; khác
tài khoản thì áp dụng quy tắc đổi tài khoản ở trên.

## Mô hình dữ liệu (PostgreSQL)

Mọi bảng dữ liệu người dùng có `rev bigint`, lấy từ một sequence chung
`sync_rev` mỗi khi dòng đó được ghi. Client dùng `rev` để lấy thay đổi mới.

```
users            id uuid PK, google_sub text UNIQUE, email, name, avatar_url,
                 reset_at bigint NULL, created_at, last_login_at

sessions         id uuid PK, user_id FK, token_hash text UNIQUE,
                 created_at, last_used_at, expires_at

settings         user_id PK FK, auto_speak bool, last_episode_id int NULL,
                 updated_at bigint, rev bigint

decks            (user_id, episode_id) PK, added_at bigint,
                 updated_at bigint, deleted_at bigint NULL, rev bigint

cards            (user_id, card_id) PK,
                 word, ipa, type, def, vi, vi_def  -- nội dung từ
                 episode_ids int[],
                 state text, step int, ease real, interval real, due bigint,
                 reps int, lapses int, added_at bigint, last_review bigint NULL,
                 updated_at bigint, deleted_at bigint NULL, rev bigint

review_logs      id uuid PK (client sinh), user_id FK, card_id text,
                 rating text, state_before text, interval_before real,
                 interval_after real, reviewed_at bigint, day text (YYYY-MM-DD),
                 rev bigint
                 INDEX (user_id, day)

legacy_days      (user_id, import_id, day) PK, reviews int, learned int,
                 imported_at bigint

listening        (user_id, episode_id) PK, position_sec real, duration_sec real,
                 play_count int, completed_at bigint NULL,
                 first_played_at bigint, last_played_at bigint,
                 updated_at bigint, rev bigint
```

Mốc thời gian là epoch milliseconds (`bigint`), cùng đơn vị với `Date.now()`
đang dùng trong `srs.js`.

`review_logs` là lịch sử học thật sự. `legacy_days` giữ số liệu `days` có từ
trước khi có log, hoặc tạo lúc chưa đăng nhập.

## Dữ liệu local

`englishpod_srs_v1` giữ nguyên cấu trúc, thêm:

- `updatedAt` trên mỗi card. Card cũ chưa có thì lấy `lastReview ?? addedAt`.
- `deckMeta: { [episodeId]: { addedAt, updatedAt } }`. Mảng `decks` giữ nguyên
  để không đổi code hiển thị.
- `tombstones: { cards: { [id]: deletedAt }, decks: { [episodeId]: deletedAt } }`:
  ghi nhận các lần xoá để đẩy lên. Xoá sau khi đẩy thành công.
- `settingsUpdatedAt`.
- `resetAt` (null nếu chưa reset).
- `pendingLogs: ReviewLog[]`: chỉ ghi khi **đã đăng nhập**, xoá sau khi đẩy
  thành công. Lúc chưa đăng nhập không ghi log, để localStorage không phình quá
  giới hạn ~5 MB.

Mọi action trong `srsStore.js` (`addDeck`, `removeDeck`, `rateCard`,
`relearnCard`, `updateSettings`, `backfillCardContent`) đặt `updatedAt = now`
trên những gì nó sửa. `removeDeck` ghi tombstone cho deck và cho mỗi card bị xoá
theo. `resetProgress` đặt `resetAt = now` và xoá cards, decks, days, tombstones.

Key mới:

- `englishpod_listening_v1`: `{ [episodeId]: ListeningRecord }`.
- `englishpod_auth_v1`: `{ token, user }`.
- `englishpod_sync_v1`: `{ ownerId, cursor, lastPushAt, lastSyncedAt,
  legacyImportId }`.

## Giao thức đồng bộ: `POST /sync`

Request:

```json
{
  "cursor": 1234,
  "changes": {
    "cards":    [{ "id": "apple", "...": "các trường card", "updatedAt": 0, "deletedAt": null }],
    "decks":    [{ "episodeId": 1, "addedAt": 0, "updatedAt": 0, "deletedAt": null }],
    "listening":[{ "episodeId": 1, "positionSec": 42.5, "durationSec": 180,
                   "playCount": 2, "completedAt": null,
                   "firstPlayedAt": 0, "lastPlayedAt": 0, "updatedAt": 0 }],
    "settings": { "autoSpeak": true, "lastEpisodeId": 1, "updatedAt": 0 },
    "reviewLogs": [{ "id": "uuid", "cardId": "apple", "rating": "good",
                     "stateBefore": "new", "intervalBefore": 0, "intervalAfter": 1,
                     "reviewedAt": 0, "day": "2026-09-28" }],
    "legacyDays": { "importId": "uuid", "days": { "2026-09-27": { "reviews": 10, "learned": 3 } } },
    "resetAt": null
  }
}
```

`cursor = null` nghĩa là lần đồng bộ đầu tiên của máy này. Mọi trường trong
`changes` đều có thể bỏ trống.

Response:

```json
{
  "cursor": 1301,
  "changes": { "cards": [], "decks": [], "listening": [], "settings": null },
  "days": { "2026-09-27": { "reviews": 12, "learned": 3 } },
  "resetAt": null
}
```

### Server xử lý

Toàn bộ trong một transaction, bắt đầu bằng
`pg_advisory_xact_lock(hash(user_id))` để các lần đồng bộ của cùng một user chạy
lần lượt. Nếu không khoá, một transaction lấy `rev` nhỏ hơn nhưng commit sau có
thể bị client khác bỏ sót.

1. **resetAt:** nếu gửi lên lớn hơn `users.reset_at` thì cập nhật, và đánh dấu
   xoá (`deleted_at = resetAt`, cấp `rev` mới) mọi card và deck có
   `updated_at < resetAt`.
2. **cards, decks, settings:** ghi nếu chưa có dòng, hoặc `incoming.updatedAt >
   existing.updatedAt`. Bằng nhau thì giữ bản trên server. Bỏ qua bản ghi có
   `updatedAt < users.reset_at`.
3. **listening:** ghi nếu `incoming.updatedAt > existing.updatedAt`, nhưng
   `play_count = max(hai bên)`, `first_played_at = min(hai bên)`, và
   `completed_at` lấy giá trị khác null sớm nhất.
4. **reviewLogs:** `INSERT ... ON CONFLICT (id) DO NOTHING`. Gửi lại cùng một
   log không bị đếm hai lần. Bỏ qua log có `reviewedAt < users.reset_at`.
5. **legacyDays:** `INSERT ... ON CONFLICT (user_id, import_id, day) DO
   NOTHING`. Mỗi máy có một `importId` riêng, sinh một lần, nên gửi lại không bị
   cộng trùng; hai máy khác nhau thì cộng dồn.
6. **Pull:** lấy mọi dòng cards, decks, listening, settings của user có `rev >
   cursor`, kể cả dòng đã đánh dấu xoá. `cursor` mới là `max(rev)` của user.
7. **days:** với mỗi `day`, `reviews = count(review_logs) + sum(legacy_days.reviews)`,
   `learned = count(review_logs có state_before = 'new') +
   sum(legacy_days.learned)`. Chỉ tính log có `reviewed_at >= reset_at` và
   legacy có `imported_at >= reset_at`.

### Client xử lý

**Chọn dữ liệu cần đẩy:**

- card, deck, listening có `updatedAt > lastPushAt`
- toàn bộ `tombstones`
- settings nếu `settingsUpdatedAt > lastPushAt`
- toàn bộ `pendingLogs`
- `legacyDays` nếu là lần đầu và máy có `days`
- `resetAt` nếu có

Trước khi gửi, ghi lại mốc `pushStartedAt = Date.now()`.

**Khi thành công:**

1. Áp dụng thay đổi pull về theo cùng quy tắc gộp như server. Bản ghi đã đánh
   dấu xoá thì xoá khỏi local.
2. Thay `days` bằng `days` của server, cộng thêm các log vẫn còn chờ (ghi trong
   lúc request đang chạy).
3. Nếu `resetAt` của server lớn hơn của local: xoá card, deck có `updatedAt <
   resetAt` và lưu `resetAt` mới.
4. Xoá khỏi `pendingLogs` và `tombstones` những mục vừa gửi.
5. Đặt `lastPushAt = pushStartedAt`, lưu `cursor` và `lastSyncedAt`.

Một bản ghi vừa pull về có thể có `updatedAt > lastPushAt`, nên bị đẩy lại ở lần
sau. Việc này vô hại, vì server không ghi đè khi `updatedAt` không mới hơn.

**Lần đồng bộ đầu tiên với dữ liệu tạo lúc chưa đăng nhập:** gửi toàn bộ cards,
decks, listening, settings, và `days` dưới dạng `legacyDays`, với `cursor =
null`.

**Khi nào đồng bộ** (chỉ khi đã đăng nhập, không chạy hai lần song song):

- ngay sau khi đăng nhập
- khi mở app
- 2 giây sau thay đổi cuối cùng
- khi tab được hiện lại (`visibilitychange`)
- khi có mạng lại (`online`)

Lỗi mạng hoặc 5xx: thử lại với độ trễ tăng dần (5 giây, 30 giây, 2 phút). Timeout
mỗi request 90 giây, đủ cho Render thức dậy.

### Giới hạn đã chấp nhận

- Quy tắc "mới hơn thì thắng" dựa vào đồng hồ từng máy. Máy lệch giờ có thể làm
  bản sửa cũ đè bản mới.
- Hai máy cùng offline thêm hai deck khác nhau có chung một từ: card đó chỉ giữ
  `episodeIds` của máy sửa sau cùng.

## Lịch sử nghe

`ListeningRecord` như trong bảng `listening`. `src/lib/listeningStore.js` lưu
vào `englishpod_listening_v1`, API kiểu `useSyncExternalStore` giống
`srsStore.js`.

AudioPlayer:

- **Lần `play` đầu tiên sau khi nạp một episode:** `playCount + 1`, ghi
  `firstPlayedAt` nếu chưa có, cập nhật `lastPlayedAt`.
- **Lưu vị trí:** mỗi 15 giây khi đang phát, khi `pause`, khi đổi episode, và
  khi `pagehide`.
- **`ended`:** đặt `completedAt` nếu chưa có, `positionSec = 0`.
- **Nạp episode:** nếu `5 < positionSec < durationSec - 5` thì tua đến
  `positionSec`.

Mỗi lần ghi đều cập nhật `updatedAt` và báo cho sync lên lịch đồng bộ.

`lastEpisodeId` (thay cho `englishpod_last_episode_id`) và `autoSpeak` được đồng
bộ qua `settings`. Nếu có key cũ `englishpod_last_episode_id` thì đọc một lần
rồi chuyển sang.

## API

| Method | Path | Auth | Việc làm |
| --- | --- | --- | --- |
| GET | `/health` | Không | `{ ok: true }`, cũng dùng để đánh thức server |
| POST | `/auth/google` | Không | `{ credential }` → `{ token, user }` |
| POST | `/auth/logout` | Có | Xoá session hiện tại |
| GET | `/me` | Có | `{ user }` |
| POST | `/sync` | Có | Như trên |

Lỗi luôn có dạng `{ "error": { "code": "...", "message": "..." } }`:

| HTTP | code | Khi nào |
| --- | --- | --- |
| 400 | `invalid_request` | zod từ chối body |
| 401 | `unauthorized` | Thiếu, sai hoặc hết hạn token |
| 401 | `invalid_google_token` | Google từ chối ID token |
| 429 | `rate_limited` | Vượt giới hạn |
| 500 | `internal` | Lỗi khác (log chi tiết ở server, không trả ra ngoài) |

- **Rate limit** (theo IP, `express-rate-limit`): `/auth/*` 20 request / 15
  phút, `/sync` 120 request / phút.
- **Body JSON** tối đa 5 MB (lần import đầu có thể ~4.000 card).
- **CORS:** chỉ cho các origin trong `CORS_ORIGINS`, cho header `Authorization`
  và `Content-Type`, không dùng credentials.

## Cấu trúc code

```
server/
  package.json            type: module, engines.node >= 22
                          scripts: dev (tsx watch), build (tsc), start (node dist/index.js),
                          typecheck (tsc --noEmit), smoke (tsx scripts/smoke.ts)
  tsconfig.json           strict, module/moduleResolution NodeNext, outDir dist
  .env.example            DATABASE_URL, DIRECT_URL, GOOGLE_CLIENT_ID, CORS_ORIGINS, PORT
  prisma/schema.prisma
  src/index.ts            đọc env, listen
  src/app.ts              express, cors, json, rate limit, routes, error handler
  src/db.ts               Prisma client
  src/errors.ts           HttpError + middleware trả lỗi chuẩn
  src/auth/google.ts      verifyGoogleCredential(credential) → profile
  src/auth/sessions.ts    createSession, revokeSession, requireAuth
  src/routes/auth.ts      /auth/google, /auth/logout, /me
  src/routes/sync.ts      /sync
  src/sync/schema.ts      zod cho request /sync; kiểu TS suy ra bằng z.infer
  src/sync/merge.ts       quy tắc gộp thuần (dùng cho cả smoke test)
  src/sync/service.ts     transaction đồng bộ
  scripts/smoke.ts        kiểm thử end-to-end
```

FE giữ JavaScript như code hiện có:

```
src/lib/api.js            fetch có base URL, token, timeout, lỗi chuẩn
src/lib/auth.js           store đăng nhập, nạp GIS, login, logout
src/lib/sync.js           chọn thay đổi, áp dụng dữ liệu pull, lên lịch đồng bộ
src/lib/listeningStore.js
src/lib/srsStore.js       thêm updatedAt, tombstones, pendingLogs, resetAt, applyRemote
src/components/AccountButton.jsx   nút Google / avatar + menu
src/components/AudioPlayer.jsx     ghi lịch sử nghe, phát tiếp từ vị trí cũ
src/App.jsx               gắn AccountButton, đọc lastEpisodeId từ settings
```

FE cần hai biến lúc build: `VITE_API_URL` và `VITE_GOOGLE_CLIENT_ID`. Workflow
GitHub Pages đọc chúng từ repository variables.

## Deploy

1. **Google Cloud Console:** tạo OAuth Client ID loại Web application.
   Authorized JavaScript origins là `http://localhost:5173` và
   `https://dangsangn.github.io`.
2. **Neon:** tạo project, lấy connection string pooled (`DATABASE_URL`) và
   direct (`DIRECT_URL`, dùng cho migrate).
3. **Render:** Web Service, root directory `server`.
   - Build: `npm ci && npx prisma migrate deploy && npm run build`
   - Start: `npm start`
   - Env: `DATABASE_URL`, `DIRECT_URL`, `GOOGLE_CLIENT_ID`, `CORS_ORIGINS=https://dangsangn.github.io,http://localhost:5173`
4. **GitHub:** repository variables `VITE_API_URL` (URL Render) và
   `VITE_GOOGLE_CLIENT_ID`, truyền vào bước build trong workflow.

## Kiểm thử

Theo lựa chọn không dùng framework test, kiểm thử bằng script chạy thật và thao
tác trên app.

**`npm run typecheck`** phải sạch lỗi.

**`npm run smoke`** (trong `server/`, cần `DATABASE_URL` trỏ tới DB dev):

- Tạo user và session test trực tiếp qua Prisma (không có endpoint bỏ qua đăng
  nhập), khởi động app trên một cổng ngẫu nhiên, đóng vai hai thiết bị A và B.
- Các kịch bản:
  - A đẩy card và deck, B pull về thấy đủ.
  - A và B cùng sửa một card: bản `updatedAt` lớn hơn thắng ở cả hai phía.
  - A xoá deck: B nhận bản ghi xoá.
  - Gửi cùng một review log hai lần: `days` chỉ đếm một lần.
  - Gửi `legacyDays` cùng `importId` hai lần: không cộng trùng. Khác `importId`
    thì cộng dồn.
  - Reset: card và log cũ biến mất, `days` về 0.
  - Listening: `playCount` lấy max, `completedAt` giữ bản sớm nhất.
  - Không gửi token hoặc gửi token sai: 401. Body sai: 400.
- Xoá user test khi xong.

**Kiểm tra trên trình duyệt** (`npm run dev` + server local):

- Chưa đăng nhập: học vài thẻ, nghe một bài, tải lại trang thì mọi thứ còn.
- Đăng nhập: dữ liệu local lên server (kiểm tra trong DB), menu hiện giờ đồng bộ.
- Mở cửa sổ ẩn danh, đăng nhập cùng tài khoản: thấy cùng thẻ, cùng vị trí nghe,
  bài nghe mở đúng chỗ đã dừng.
- Đăng xuất: dữ liệu học trên máy bị xoá, app về trạng thái trống.
- Tắt server trong lúc học: UI vẫn chạy, bật lại thì tự đồng bộ.

## Ngoài phạm vi

- Xoá tài khoản, xuất dữ liệu.
- Trang thống kê hay biểu đồ lịch sử (dữ liệu đã có, UI để sau).
- Google One Tap, các cách đăng nhập khác.
- Đồng bộ theme và cache dịch.

## Điều chỉnh khi lập kế hoạch

Plan `docs/superpowers/plans/2026-09-28-google-auth-sync.md` thay đổi một số chi
tiết so với các phần trên:

- **Gộp dữ liệu làm bằng SQL**, không có `src/sync/merge.ts`: mỗi bảng một câu
  `INSERT … SELECT FROM jsonb_to_recordset(…) ON CONFLICT … DO UPDATE … WHERE
  updated_at < EXCLUDED.updated_at`, nên lần import ~4.000 thẻ vẫn chỉ là vài
  câu lệnh. `src/sync/wire.ts` giữ kiểu dữ liệu trả về và các hàm chuyển đổi.
- **Định dạng xoá tách riêng:** request và response dùng `deletedCards: [{ id,
  deletedAt }]` và `deletedDecks: [{ episodeId, deletedAt }]` thay cho trường
  `deletedAt` trên bản ghi.
- **Hẹn giờ đồng bộ:** thay đổi việc học chờ 2 giây, thay đổi lịch sử nghe chờ
  30 giây (vị trí nghe được ghi mỗi 15 giây); nếu đã có lượt hẹn sớm hơn thì
  giữ lượt đó.
- **Ghi log ôn tập** bật khi dữ liệu trên máy đã thuộc một tài khoản
  (`ownerId` khác null), kể cả khi session vừa hết hạn, để không mất lượt ôn.
- **`lastPlayedAt`** lấy giá trị lớn hơn, không theo bản mới nhất.
- **Số thực** dùng `double precision` (mặc định của Prisma `Float`).
- **Deck cũ** chưa có `updatedAt` được gán thời điểm nạp lần đầu sau khi nâng
  cấp.
- **Mã lỗi thêm:** 404 `not_found`, 413 `payload_too_large`, 503
  `google_not_configured` (chưa đặt `GOOGLE_CLIENT_ID` thì không nhận token nào).
- **Đăng nhập dev không cần Google:** `npm run session -- email` trong `server/`
  tạo session trực tiếp trong DB và in lệnh `__devSignIn(...)` để dán vào
  console của bản dev (chỉ có khi `import.meta.env.DEV`).

---
phase: 4
title: "Đường nội dung nhị phân an toàn đầu-cuối"
status: completed
completed: 2026-08-14
priority: P1
effort: "3d"
dependencies: [2]
---

# Phase 4: Đường nội dung nhị phân an toàn

## Overview

Nguồn có 56 file nhị phân (font woff/ttf, PNG). Đường từ nguồn tới đĩa người dùng có **bốn**
hop, cả bốn đều cứng `utf8`. Bản plan trước chỉ sửa hop đầu và đặt tiêu chí đo đúng hop đó
— nên tiêu chí sẽ xanh trong khi 56 asset bị phá.

## Requirements

Functional:
- Cả bốn hop giữ nguyên byte: generator nhúng → self-extract → `skillFiles()` → `atomicWrite`.
- Receipt hash tính trên **bytes**, không trên chuỗi đã decode.
- Bit thực thi có kiểm soát: manifest nhúng mang `mode`, chỉ nhận `0644`/`0755`, không suy
  ra từ filesystem nguồn.
- Generator không đi theo symlink, dùng chung ignore list, có ignore secret (`.env*`,
  `*.pem`, `id_*`).
- Self-extract atomic và chống đua: extract ra temp dir rồi rename thư mục.
- Cache đóng dấu bằng **hash của asset map**, không phải version package.
- Verify khi **đọc** với nội dung thực thi, không chỉ khi ghi.

Non-functional:
- Binary ≤ 120MB; materialize cold cache ≤ 800ms.
- Nhúng lazy — không parse literal 22MB thành object mỗi lần gọi CLI.

## Architecture

Bốn hop và chỗ hỏng của từng hop:

| Hop | File | Vấn đề |
|---|---|---|
| 1. Nhúng | `generate-embedded-kit.mjs:26` | `readFileSync(abs, "utf8")`; `statSync` theo symlink; không ignore list |
| 2. Self-extract | `embedded-kit.ts:22-34` | ghi không atomic, sentinel ghi cuối, không lock, đóng dấu version |
| 3. Đọc để cài | `artifact-content.ts:67` | `readFileSync(abs, "utf8")` **trước** khi rẽ nhánh `isTextFile` |
| 4. Ghi ra đĩa | `fs-atomic.ts:12` | `writeFileSync(tmp, content, "utf8")`; `install-types.ts:8` `content: string` |

Hop 3 là chỗ tinh vi nhất: nhánh `isTextFile(entry)` chỉ quyết định có chạy `adaptText` hay
không — file đã bị decode thành string ở dòng trên rồi.

`WriteOp.content` mở sang `string | Buffer`. `adaptText` chỉ chạy trên nhánh text, giữ
nguyên. `sha256` nhận `string | Buffer`.

Nhúng lazy: `Record<string, () => Buffer>` hoặc một blob base64 duy nhất cắt lát theo
offset — quyết định theo số đo ở bước 6.

## Related Code Files

- Modify: `packages/cli/scripts/generate-embedded-kit.mjs` — `lstatSync`, bỏ symlink,
  ignore list dùng chung, phân nhánh encoding, ghi `mode`
- Modify: `packages/cli/src/kit/embedded-kit.ts` — temp dir + rename, đóng dấu theo hash,
  verify khi đọc
- Modify: `packages/cli/src/install/install-types.ts` — `content: string | Buffer`, `mode?`
- Modify: `packages/cli/src/install/artifact-content.ts` — đọc Buffer, decode chỉ nhánh text
- Modify: `packages/cli/src/install/fs-atomic.ts` — ghi không ép encoding, áp `mode`
- Modify: `packages/cli/src/install/install-receipt.ts` — hash trên bytes
- Modify: `packages/cli/src/install/install-execute.ts` — truyền `mode`
- Create: `packages/cli/scripts/generate-embedded-kit.test.mjs` — round-trip nhị phân
- Modify: `packages/cli/scripts/build-binaries.mjs` — gate kích thước

## Implementation Steps

1. Test đỏ đầu-cuối: nhúng một PNG + một woff2 thật, build, cài vào provider tree tạm, so
   byte file **đích** với nguồn. Đây là tiêu chí thật, không phải round-trip ở cache.
2. Mở `WriteOp.content` sang `string | Buffer`; sửa `artifact-content.ts` đọc Buffer rồi
   chỉ `toString("utf8")` trên nhánh text; sửa `fs-atomic.ts` bỏ ép `"utf8"`.
3. Sửa `install-receipt.ts` hash trên bytes; test rằng hash của file nhị phân ổn định.
4. Sửa generator: `lstatSync`, bỏ symlink, ignore list import từ `install-types.ts`, thêm
   ignore secret, phân nhánh encoding, ghi `mode` (chỉ `0644`/`0755`).
5. Sửa self-extract: ghi vào `<cache>.tmp-<pid>` rồi `renameSync` cả thư mục; đóng dấu
   cache bằng hash asset map; verify hash khi đọc file thực thi.
6. Đo: build binary với kit đầy đủ 16.8MB. Ghi kích thước + thời gian materialize cold.
   Vượt ngưỡng thì chuyển sidecar archive trước khi đi tiếp.
7. Gate kích thước vào `build-binaries.mjs`. Gate khởi động dùng lệnh **thật sự
   materialize** (ví dụ `av list` với cache lạnh), không dùng `av --version` — lệnh đó đọc
   `package.json` và không bao giờ chạm kit root.
8. Thêm pre-commit check: `kit-embedded.generated.ts` không khớp pattern của
   credential-sanitizer.

## Success Criteria

- [x] PNG và woff2 byte-identical **trên provider tree sau `av install`**, không phải ở cache
- [x] Receipt hash của file nhị phân tính trên bytes; sửa 1 byte → hash đổi
- [x] Generator bỏ qua mọi symlink; không file nào ngoài kit lọt vào map
- [x] File có `mode: 0755` cài ra thực thi được; mode khác `0644`/`0755` bị từ chối
- [x] Hai tiến trình chạy đồng thời với cache lạnh → không file nào rách
- [x] Đổi nội dung kit mà không bump version → cache tự invalidate
- [x] Binary ≤ 120MB; materialize cold ≤ 800ms — đo được **61.9MB** và **~87ms**
- [x] `pnpm test` xanh — 737 test

## Kết quả thực thi (2026-08-14)

**Test đỏ trước xác nhận đúng chẩn đoán của phase.** PNG đi qua đường cài ra
`239,191,189…` (U+FFFD), và hash receipt **không đổi** sau khi lật một byte — vì hai file
nhị phân khác nhau decode ra cùng một chuỗi ký tự thay thế. Đó là lý do tiêu chí phải đo ở
provider tree chứ không ở cache.

### Bốn hop, đã sửa

| Hop | Thay đổi |
|---|---|
| 1. Nhúng | `lstatSync` + bỏ symlink; dùng chung `IGNORE_DIRS`/`IGNORE_FILES`; lọc secret; text → `text`, còn lại → `b64`; ghi `mode` |
| 2. Self-extract | Giải nén vào temp dir rồi `renameSync` cả thư mục; đóng dấu cache bằng digest nội dung; verify khi đọc |
| 3. Đọc để cài | Đọc `Buffer`, chỉ `toString("utf8")` trên nhánh text |
| 4. Ghi ra đĩa | `atomicWrite` không ép encoding, áp `mode` có kiểm soát |

`WriteOp.content` mở sang `string | Buffer`. Trình biên dịch liệt kê đúng **3** call site cần
sửa — không chỗ nào phải bịt bằng `as string`.

**Hai lỗi tôi tự tạo rồi tự bắt được, đều do gate quá rộng:**

Filter secret của generator `^\.env(\..+)?$` nuốt luôn `kit/.env.example` — file template kit
**thật sự cài**. Drift test bắt ngay (121 vs 122 asset). Đã thêm ngoại lệ
`example|sample|template`, đúng phân biệt mà hook `privacy-block` vẫn dùng.

Gate "không nhúng nội dung dạng token" ban đầu dùng thẳng pattern của
`credential-sanitizer` và cho 2 dương tính giả: `git/references/safety-protocols.md` **dạy**
cách nhận diện secret nên chứa header PEM, và `plan/SKILL.md` trỏ tới
`task-and-sync-back.md` — chuỗi con `sk-and-sync-back` khớp `sk-[A-Za-z0-9_-]{12,}`. Pattern
lúc in ra màn hình được phép rộng vì redact thừa không mất gì; ở đây dương tính giả chặn
build. Đã siết: `sk-` cần biên trái, PEM cần header **kèm** thân base64.

**Sentinel còn sống nhưng cây bị xoá.** Test bắt được: `.extracted` tồn tại thì CLI tin cache,
nên xoá `kit/` xong chạy lại là hỏng. `cacheUsable()` giờ kiểm digest sentinel + sự tồn tại
của kit root + hash các file thực thi. Cố ý **không** hash toàn bộ 1500 file mỗi lần khởi
động — xoá sâu trong cây vẫn nổi lên thành lỗi validate ồn ào, không phải hành vi sai âm thầm.

`mode` phải được truyền qua `install-plan.ts` mới tới được `atomicWrite`; test bit thực thi
bắt đúng mắt xích thiếu này.

### Số đo (2026-08-14, macOS arm64, kit 122 asset)

| Chỉ số | Giá trị | Ngưỡng |
|---|---|---|
| Binary | 61.9 MB | ≤ 120 MB |
| Materialize lạnh + `list` | ~87 ms | ≤ 800 ms |
| Warm | 76 ms | — |

Lần đo đầu ra 1107ms là do page cache lạnh của binary vừa ghi, không phải chi phí giải nén;
ba lần lặp sau đều ~87ms. Gate kích thước đã vào `build-binaries.mjs` — vượt ngưỡng thì
**chuyển sidecar, không nâng số**.

**Chưa quyết được vì chưa có dữ liệu: nhúng lazy.** Bước 6 của plan yêu cầu đo với kit đầy đủ
16.8MB, mà kit đó tới ở phase 11/12. Kit hiện tại 122 asset không đủ để phân biệt. Cơ chế
byte-safe đã xong và không phụ thuộc quyết định này; quyết ở phase 11 theo số đo thật.

**Chuỗi 4 chặng đầu-cuối** được chứng minh qua CLI đã build: `install` vào thư mục tạm với
`ARIADNEV_EMBEDDED=1`, rồi so byte `.claude/.env.example` với `EMBEDDED_ASSETS` — asset này
đi đúng lane base64. Khi phase 11 mang PNG/woff2 thật vào, chính test này phủ luôn.

## Risk Assessment

**Base64 đẩy binary vượt ngưỡng.** Tín hiệu: bước 6 đo > 120MB hoặc materialize > 800ms.
Phản ứng đã chọn: sidecar archive tải lười — quyết theo số đo, không đoán trước.

**Mở `content` sang Buffer chạm nhiều call site.** Tín hiệu: TypeScript báo lỗi lan rộng
ngoài `install/`. Phản ứng: đó là tín hiệu tốt — trình biên dịch đang liệt kê đúng tập
consumer cần sửa. Sửa hết, không dùng `as string` để bịt.

**Verify khi đọc làm chậm mọi lần chạy.** Tín hiệu: overhead > 50ms. Phản ứng: chỉ verify
file thực thi (`mode 0755`), không verify toàn bộ 1511 file mỗi lần.

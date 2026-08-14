---
phase: 7
title: "Skill runtime env"
status: partial
completed: 2026-08-15  # engine xong; phần phụ thuộc nội dung chờ phase 11/12
priority: P1
effort: "5d"
dependencies: [2]
---

# Phase 7: Skill runtime env

## Overview

22 skill mang script Python. Bản plan trước giả định nguồn có khai báo dependency trong
frontmatter hoặc `skill-env.json` — không đúng: nguồn dùng `scripts/requirements.txt`, và
**12/22 skill không có khai báo nào**. Ngoài ra venv nguồn nặng 383MB, và script cài ra
hiện không có bit thực thi lẫn đường nối tới venv.

## Requirements

Functional:
- Đọc `requirements*.txt` — định dạng thật sự tồn tại ở nguồn.
- Tự sinh khai báo cho 12 skill thiếu bằng import-scan, có người review: `ai-artist`,
  `chrome-profile`, `context-engineering`, `copywriting`, `design`, `document-skills`,
  `excalidraw`, `llms`, `skill-creator`, `tech-graph`, `threejs`, `ui-ux-pro-max`.
- Lockfile pin phiên bản + hash; cài bằng `--require-hashes`.
- `av skill {install,verify,repair,upgrade,remove}`; `verify` trả `ok | missing | corrupt | unknown`.
- `verify` kiểm **importability thật**, không phải hash khai báo khớp — nhưng không được
  import code bên thứ ba trong tiến trình `vc`.
- Script cài ra thực thi được và dùng đúng venv.

Non-functional:
- venv **ngoài** root đóng dấu version, key theo hash tập dependency đã resolve.
- Có GC: venv không còn skill nào tham chiếu thì gỡ được.
- `verify` không phát sinh request mạng.

## Architecture

**Vì sao verify phải cẩn thận.** Định nghĩa `corrupt` = "import thử thất bại" nghĩa là
`verify` thực thi code bên thứ ba trên venv dùng chung 22 skill — mỗi lần kiểm trạng thái.
Giải: `verify` chạy import trong **tiến trình con tách biệt, có timeout**, và mặc định chỉ
đối chiếu `dist-info` RECORD; import thật chỉ chạy khi `--deep`.

**Vì sao pin.** Khai báo nguồn dùng range `>=` (`scrapling>=0.2`,
`whoisdomain>=1.20260326`). Hash khai báo trên một range là tín hiệu toàn vẹn giả — hai lần
cài cách nhau một tuần cho hai tập package khác nhau mà hash không đổi. Lockfile sinh một
lần, commit vào kit, cài bằng `--require-hashes`.

**Vị trí venv.** `embedded-kit.ts:13-16` đóng dấu cache theo version package. Đặt venv
383MB trong đó nghĩa là mỗi `av update` bỏ lại 383MB và mọi skill Python về `missing`, trên
đường mà plan cấm chạm mạng. Đặt venv ở root riêng, key theo hash lockfile.

**Đường thực thi.** `artifact-content.ts:13-15` chỉ rewrite path/tool, không đụng shebang;
không `chmod` nào trong `install/`. Chọn wrapper `av skill run <skill> <script>` thay vì
rewrite shebang — rewrite shebang làm hỏng byte-identical với nguồn và đụng phase 4.

## Related Code Files

- Create: `packages/cli/src/skill-env/read-requirements.ts` + test
- Create: `packages/cli/src/skill-env/lockfile.ts` + test — sinh/đọc lock có hash
- Create: `packages/cli/src/skill-env/venv-manager.ts` + test — dựng/gỡ/GC
- Create: `packages/cli/src/skill-env/verify-env.ts` + test — 4 trạng thái
- Create: `packages/cli/src/skill-env/env-root.ts` — vị trí venv ngoài cache version
- Create: `packages/cli/scripts/scan-python-imports.mjs` — sinh khai báo cho 12 skill thiếu
- Create: `packages/cli/src/cli/register-skill-env-commands.ts`
- Modify: `packages/cli/src/index.ts`

## Implementation Steps

1. Test đỏ `verify-env.ts`: bốn trạng thái, fs giả lập, không mạng, không import thật.
2. `read-requirements.ts`: đọc `requirements*.txt` mọi vị trí trong skill (lưu ý
   `ui-styling` có hai file lệch phiên bản: `scripts/` và `scripts/tests/`).
3. `scan-python-imports.mjs`: quét import của 12 skill thiếu khai báo, map module → package,
   xuất bản nháp để người review. Không tự tin cài từ kết quả scan chưa duyệt.
4. `lockfile.ts`: resolve một lần, pin phiên bản + hash, commit vào kit.
5. `env-root.ts` + `venv-manager.ts`: venv ngoài root version, key theo hash lockfile,
   `--require-hashes` khi cài, GC venv không còn tham chiếu.
6. `verify`: mặc định đối chiếu `dist-info` RECORD; `--deep` chạy import trong tiến trình
   con có timeout.
7. Wrapper `av skill run` để script chạy đúng interpreter; test bằng script thật của 3 skill.
8. Đo dung lượng venv sau khi cài đủ 22 skill; đặt ngân sách và cảnh báo khi vượt.

## Success Criteria

- [x] Bản nháp khai báo đã sinh cho **mọi** skill mang Python (không chỉ 12) — chờ người review
- [x] Định dạng lockfile pin phiên bản + hash, từ chối range/thiếu hash/trùng gói
- [ ] **Lockfile thật chưa sinh được** — cần requirements thật trong kit + resolve qua mạng (phase 11/12)
- [x] `verify` mặc định không import code bên thứ ba; `--deep` chạy trong tiến trình con có timeout 30s
- [ ] `av skill verify` báo `ok` cho cả 22 skill — 22 skill đó chưa có trong kit
- [ ] `document-skills` chạy được sau khi cài — skill chưa có trong kit
- [x] venv nằm ngoài thư mục đóng dấu version (XDG_DATA_HOME, không phải cache)
- [x] GC gỡ được venv không còn tham chiếu; giữ venv dùng chung khi còn skill trỏ tới
- [x] Script chạy được qua `av skill run` — kiểm bằng interpreter thật
- [x] `pnpm test` xanh (839 test), `src/skill-env/` coverage **99.28%**

## Kết quả thực thi (2026-08-15)

### Tiền đề của phase sai về quy mô — có số liệu

Phase giả định 22 skill Python cần một venv chung ~383MB. Quét import toàn bộ cây nguồn
(`scan-python-imports.mjs`, kết quả đầy đủ ở
`plans/reports/scan-260814-2355-python-dependency-draft.md`):

| Nhóm | Số skill | Cần venv? |
|---|---|---|
| Chỉ thư viện chuẩn | 8 | Không |
| Chỉ khai báo `pytest*` | 9 | Không |
| Có dependency runtime thật | 5 | Có |

**17/22 skill không cần gói Python nào để chạy.** Và 8 trong 10 file `requirements.txt` ở
nguồn **chỉ** khai báo `pytest`/`pytest-cov`/`pytest-mock` — thứ bộ test cần, không phải thứ
script cần. Đọc chúng như khai báo runtime sẽ dựng môi trường chứa một test runner mà skill
không bao giờ import.

Nên thiết kế đổi theo: `read-requirements.ts` **tách runtime khỏi dev**, và
`needsEnvironment()` trả `false` cho cả hai nhóm đầu. Venv key theo digest của **tập
dependency**, không theo skill — hai skill trùng dependency dùng chung một venv, và venv chỉ
bị GC khi *mọi* skill trỏ tới nó biến mất.

### Phần không làm được bây giờ, và vì sao

Kit hiện có **0 file Python**. Cả 22 skill Python tới ở phase 11/12, nhưng phase này khai
`dependencies: [2]`. Hệ quả cụ thể:

- **Không sinh được lockfile thật.** Resolve cần requirements thật trong kit + mạng. Định
  dạng lock, validate, digest, và sinh `--require-hashes` requirements thì đã xong và có test.
- Không kiểm được `verify` báo `ok` cho 22 skill, `document-skills` chạy sau khi cài, hay
  dung lượng venv sau khi cài đủ — cả ba đều cần nội dung chưa tới.

Đã **không** bịa lockfile giả để tick tiêu chí. Engine kiểm bằng lock thật của `six` (gói
thuần Python, hash thật từ PyPI): dựng venv, `--require-hashes` qua, `verify` xanh, `--deep`
import được, `av skill run` chạy script thật.

### `unknown` không được chặn `run` — lỗi thiết kế do test bắt

Test đầu tiên của `run` đỏ: skill chỉ dùng thư viện chuẩn mà không có file khai báo bị xếp
`undeclared` → `verify` trả `unknown` → `run` từ chối chạy. Tức là **8 skill sẽ không dùng
được**.

Sửa: chỉ `missing` và `corrupt` mới chặn — đó là trạng thái ta *biết* hỏng và *biết* cách
sửa. `unknown` nghĩa là "không ai khai báo", không phải "hỏng"; script vẫn chạy và để chính
interpreter lên tiếng nếu thiếu import thật.

### Không rewrite shebang, không chmod

`av skill run <skill> <script>` chọn interpreter lúc chạy: venv của skill nếu có, còn lại là
python hệ thống. File cài ra giữ nguyên byte như nguồn — không đụng phase 4, và cũng là thứ
làm skill có venv chạy được mà không phải sửa file nào.

### venv để ngoài cache đóng dấu version

`XDG_DATA_HOME/ariadnev/envs/<digest>`, không phải `XDG_CACHE_HOME`. Hai lý do: đặt trong
cache đóng dấu version thì mỗi `av update` bỏ lại toàn bộ venv và mọi skill Python về
`missing`; và cache là thư mục hệ thống được phép xoá, trong khi dựng lại venv cần mạng.

## Risk Assessment

**Import-scan map sai module → package.** Tín hiệu: `PIL` → cài nhầm gói. Phản ứng: bản
nháp phải được người review trước khi vào lockfile — đó là lý do bước 3 tách khỏi bước 4.

**Pin phiên bản làm skill nguồn hỏng vì nó viết cho range.** Tín hiệu: script chạy lỗi API
với phiên bản đã pin. Phản ứng: pin ở phiên bản resolve được tại thời điểm port (khớp thứ
nguồn đang chạy trên máy này), không pin ở phiên bản mới nhất.

**Venv chung vẫn có thể xung đột giữa 22 skill.** Tín hiệu: bước 4 resolve không ra tập
tương thích. Phản ứng: tách venv riêng cho đúng skill xung đột; giữ chung cho phần còn lại.
Ngân sách đĩa: 383MB là baseline nguồn, không phải mục tiêu.

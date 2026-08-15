---
phase: 11
title: "Port nội dung wave A — 27 skill độc lập"
status: completed
priority: P2
effort: "5d"
dependencies: [3, 4, 5, 7]
---

# Phase 11: Port nội dung wave A

## Overview

27 skill có 0 cross-reference — port được không cần thứ tự. Đây cũng là phép thử thật cho
schema (phase 3), đường nhị phân (phase 4), backup (phase 5) và runtime env (phase 7) trước
khi cam kết cho 76 skill còn lại.

Danh sách: mcp-builder, media-processing, mermaidjs-v11, mintlify, mobile-development,
payment-integration, react-best-practices, remotion, research, research-prompt, retro,
scenario, security, security-scan, sequential-thinking, shader, shopify, tanstack, threejs,
ui-styling, ui-ux-pro-max, web-design-guidelines, web-testing, interview-docs, llms,
graphify, folder-context.

4 trong số này (`research`, `scenario`, `security-scan`, `sequential-thinking`) đã có bản
distill và **bị ghi đè** theo quyết định ở `plan.md`.

## Requirements

Functional:
- Copy nguyên văn, chỉ đổi định danh: `ak:` → `av:`, `AgentKit` → `ariadnev`,
  `AGENTKIT_*` → `ARIADNEV_*`, `~/.agentkit` → đường dẫn ariadnev.
- Giữ nguyên cấu trúc thư mục con, kể cả `rules/` 50 file của react-best-practices và
  `canvas-fonts/` 84 file của ui-styling.
- **Cổng script bắt buộc:** mọi script trong wave phải qua `av audit scripts`; mỗi finding
  hoặc được sửa, hoặc được chấp nhận bằng văn bản có chữ ký người dùng trong phase file này.

Non-functional:
- Không sửa nội dung kỹ thuật — chỉ rebrand định danh và xử lý finding của cổng script.
- Validate sau mỗi lô, không để cuối.

## Architecture

Script port dùng lại cho wave B: đọc skill nguồn, áp bảng thay thế theo **ranh giới token**
(`ak:cook` là tên skill; "ak" trong văn xuôi tiếng Anh thì không), ghi sang `kit/skills/`,
validate.

Thứ tự trong wave chọn theo mức rủi ro kỹ thuật, không theo alphabet: skill nhẹ trước để
kiểm schema, rồi skill nặng asset để kiểm ngưỡng phase 4, rồi skill có script để kiểm phase 7.

**Cổng script.** `av audit scripts` (phase 6) là dependency cứng. Nguồn có ít nhất một
installer đặc quyền (`cti-expert/scripts/install.sh` — `sudo apt-get`, `go install`,
`curl -sL | tar -xz`, `sudo mv`), và nó nằm ở wave B. Nhưng cổng phải áp từ wave A để quy
trình được kiểm chứng trước khi gặp ca khó.

## Related Code Files

- Create: `packages/cli/scripts/port-skill.mjs` + `.test.mjs`
- Create: `kit/skills/<name>/**` — 27 cây skill
- Modify: phase file này — mục "Chấp nhận rủi ro script" (điền khi chạy)

## Implementation Steps

1. Viết `port-skill.mjs` + test bảng thay thế: `ak:cook` → `av:cook` đổi; "ak" trong văn
   xuôi không đổi; đường dẫn đổi; env var đổi.
2. Port 3 skill nhẹ không script (mermaidjs-v11, research, scenario) — kiểm schema phase 3.
   Review diff bằng mắt trước khi chạy hàng loạt.
3. Port 3 skill nặng asset (ui-styling 5.8MB, ui-ux-pro-max, threejs) — kiểm ngưỡng phase 4
   và tính byte-identical **trên provider tree** sau khi cài.
4. Port skill có script (media-processing, mcp-builder, shopify, llms) — chạy
   `av audit scripts`, xử lý finding, kiểm `av skill verify` báo `ok` thật.
5. Port 18 skill còn lại theo lô ~6, validate sau mỗi lô.
6. Sau mỗi lô: `av validate` + build + đo kích thước binary.

## Chấp nhận rủi ro script

| File | Finding | Quyết định | Lý do | Ngày |
|---|---|---|---|---|
| `media-processing/scripts/remove-background.sh` | medium `remote-package-install` — `npm install -g rmbg-cli` chạy im lặng khi thiếu tool | **Sửa** | Cài package global là thay đổi máy người dùng; script skill không phải chỗ làm việc đó mà không hỏi. Thay bằng in hướng dẫn + `exit 1`. Script vốn cũng không chạy tiếp được nếu thiếu tool, nên không mất chức năng | 2026-08-15 |
| `media-processing/scripts/batch-remove-background.sh` | như trên | **Sửa** | như trên | 2026-08-15 |

Không có finding nào được chấp nhận. Sau khi sửa: **80 script quét, 0 flagged**.

## Success Criteria

- [x] 27 skill trong `kit/skills/` (tổng **49**), `av validate` xanh — 0 error, 22 warning
- [x] Grep `ak:`, `AgentKit`, `AGENTKIT_`, `~/.agentkit`: **0** — nay là cổng CI, không phải grep tay
- [x] **81** file font của ui-styling byte-identical trên provider tree sau `av install` (sha256 từng file)
- [x] `av audit scripts`: **80 script** quét (không phải 2), 0 flagged sau khi sửa
- [x] `av skill verify`: 3 skill stdlib-only đã khai báo; `mcp-builder` báo đúng lý do còn thiếu
- [x] Ghi đè 4 skill distill — đều nằm trong git, `git diff` khôi phục được
- [x] Binary **73MB**, ngưỡng 120MB
- [x] `pnpm test` xanh (929 test)

## Risk Assessment

**Thay định danh làm hỏng nội dung khi "ak" ở trong văn xuôi hoặc code mẫu.** Tín hiệu:
diff có thay đổi ngoài ý muốn. Phản ứng: thay theo ranh giới token + review diff 3 skill đầu
bằng mắt trước khi chạy hàng loạt.

**Ba skill nặng asset đẩy binary vượt ngưỡng.** Tín hiệu: bước 3 đo vượt. Phản ứng: kích
hoạt sidecar archive đã dự phòng ở phase 4 — đó là lý do port chúng sớm.

**Cổng script thành hình thức vì ai cũng bấm chấp nhận.** Tín hiệu: bảng chấp nhận đầy
dòng "chấp nhận" không có lý do cụ thể. Phản ứng: finding có `sudo`, `curl|tar`, hoặc
`go install` không được chấp nhận bằng một dòng — phải nêu rõ script làm gì và vì sao cần.


## Kết quả (2026-08-15)

### Giả định "27 skill có 0 cross-reference" — sai

**8 trong 27** tham chiếu chéo, tới 11 skill nằm ngoài wave (tất cả đều tồn tại ở nguồn, sẽ
về ở phase 12). Không thể coi là link hỏng, cũng không thể lờ đi. Giải:
`kit/skills-pending-port.json` khai tên các skill đang chờ port; check chỉ báo lỗi khi tên
**không có ở cả hai danh sách**. Một test bắt danh sách này teo dần: tên nào đã port mà còn
nằm đó thì đỏ.

### Va chạm thật giữa lint của kit và corpus nguồn

Đo trước khi quyết, trên cả 103 skill nguồn:

| Luật | Vi phạm |
|---|---|
| `## Output format` bắt buộc | **103/103** |
| `## Quality gates` bắt buộc | **103/103** |
| `## Workflow position` bắt buộc | **101/103** |
| description ≤ 200 ký tự | 44/103 (dài nhất 604) |
| SKILL.md ≤ 300 dòng | 17/103 (dài nhất 902) |
| reference ≤ 300 dòng | 136/740 file (dài nhất 2249) |
| frontmatter field lạ | **0** |

Ba luật đầu mô tả *cách nhà này viết skill*, không phải tính hợp lệ. Ép chúng lên nội dung
copy chỉ còn hai đường, đều tệ hơn: sửa nội dung đã hứa copy nguyên văn, hoặc miễn trừ cả
loạt (tức là khai tử cái bar mà không nói ra).

Chọn: skill port mang `metadata.origin: ported`; luật văn phong chỉ áp cho skill **mình
viết**. Skill port vẫn bị kiểm mọi thứ liên quan tới *tính hợp lệ* (frontmatter, field lạ,
description tồn tại và đủ dài). Kích thước vượt ngưỡng thành **cảnh báo**, không phải lờ đi —
chi phí context là thật, cứ để nó hiện ra dù không phải việc của mình sửa.

Đồng thời `author: agentkit` → `author: upstream`, không phải `ariadnev`: viết tên mình lên
bài người khác là một câu sai, dù nhỏ.

### Ba lỗi trong chính cổng kiểm, lộ ra nhờ nội dung thật

1. **Orphan check bỏ sót dạng viết phổ biến nhất.** Regex chỉ nhận `references/x.md` trần;
   nguồn viết `./references/x.md`. Lookbehind loại mọi thứ đứng sau `/` — vốn để bỏ qua
   đường dẫn của skill khác — nên loại luôn dạng này. **43 báo động giả.** Sau khi sửa còn
   22 orphan **thật** (threejs ship 3 file mà mục lục của chính nó không liệt kê).
2. **Cổng script chỉ đọc shell.** 22/24 script của wave là Python — quét xong báo "pass" mà
   chưa đọc gì. Mở rộng sang `.py`/`.js` (2 → **80 script**), thêm luật cho `subprocess`
   gọi `sudo`, `shell=True`, và fetch-rồi-exec.
3. **Hai dương tính giả ngay sau đó**, và cả hai đều thuộc loại làm người ta bỏ qua cả bản
   báo cáo: một *comment* `//` trong `.cjs` bị đọc như lệnh sudo, và một
   `print("npm install -g …")` bị đọc như một lần cài. Sửa: comment marker theo ngôn ngữ, và
   luật npm chuyển sang scope `command`.

### Nợ phase 7 đã đóng một phần

Scanner import trên nội dung thật: `llms`, `threejs`, `ui-ux-pro-max` **chỉ dùng stdlib** →
khai báo rõ ràng, `verify` hết "unknown". `mcp-builder` cần `mcp` + `anthropic` thật (script
là harness chạy được, không phải template) → khai không pin, và `verify` nay nói đúng lý do:
"declares dependencies but has no pinned lock", thay câu cũ bảo người ta đi khai báo cái họ
đã khai.

### Đo được

- Binary **73MB** (từ 61.9MB), ngưỡng 120MB. Toàn bộ corpus nguồn 20MB → phase 12 ước ~89MB,
  **sidecar của phase 4 nhiều khả năng không cần kích hoạt**.
- 81 font `.ttf` byte-identical trên provider tree sau khi cài; `av audit` 539 file `ok`.
- Benchmark context chạy lại trên corpus mới (2 file trong corpus đóng băng bị port ghi đè):
  mọi gate vẫn xanh, quyết định không đổi.

### Nợ chuyển tiếp

- 23 skill port chưa có behavioral scenario; 4 scenario cũ (research, scenario, security-scan,
  sequential-thinking) viết cho bản distill đã bị thay — cần đọc lại khi chạy suite tier-2.
- `mcp-builder` chưa có lock pin — cần resolve PyPI, gom vào phase 12/16.
- 22 orphan reference thật của nội dung nguồn: cảnh báo, không sửa (không phải nội dung của mình).

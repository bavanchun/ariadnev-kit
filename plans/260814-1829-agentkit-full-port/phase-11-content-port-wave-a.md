---
phase: 11
title: "Port nội dung wave A — 27 skill độc lập"
status: pending
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

*(Điền khi chạy bước 4. Mỗi dòng: file, finding, quyết định sửa/chấp nhận, lý do, ngày.)*

| File | Finding | Quyết định | Lý do | Ngày |
|---|---|---|---|---|

## Success Criteria

- [ ] 27 skill trong `kit/skills/`, `av validate` xanh
- [ ] Grep `ak:`, `AgentKit`, `AGENTKIT_`, `~/.agentkit` trong 27 skill trả 0
- [ ] 84 file font của ui-styling byte-identical **trên provider tree sau `av install`**
- [ ] `av audit scripts` chạy trên toàn wave; mọi finding đã sửa hoặc đã ghi vào bảng trên
- [ ] `av skill verify` báo `ok` cho mọi skill có script trong wave, và `ok` nghĩa là chạy được
- [ ] Ghi đè 4 skill distill → backup có đủ entry khôi phục được (kiểm phase 5)
- [ ] Kích thước binary trong ngưỡng phase 4
- [ ] `pnpm test` xanh

## Risk Assessment

**Thay định danh làm hỏng nội dung khi "ak" ở trong văn xuôi hoặc code mẫu.** Tín hiệu:
diff có thay đổi ngoài ý muốn. Phản ứng: thay theo ranh giới token + review diff 3 skill đầu
bằng mắt trước khi chạy hàng loạt.

**Ba skill nặng asset đẩy binary vượt ngưỡng.** Tín hiệu: bước 3 đo vượt. Phản ứng: kích
hoạt sidecar archive đã dự phòng ở phase 4 — đó là lý do port chúng sớm.

**Cổng script thành hình thức vì ai cũng bấm chấp nhận.** Tín hiệu: bảng chấp nhận đầy
dòng "chấp nhận" không có lý do cụ thể. Phản ứng: finding có `sudo`, `curl|tar`, hoặc
`go install` không được chấp nhận bằng một dòng — phải nêu rõ script làm gì và vì sao cần.

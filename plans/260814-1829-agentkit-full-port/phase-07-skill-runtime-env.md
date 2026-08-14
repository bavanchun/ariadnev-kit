---
phase: 7
title: "Skill runtime env"
status: pending
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

- [ ] 12 skill thiếu khai báo có khai báo được sinh và **đã review**
- [ ] Lockfile pin phiên bản + hash; cài lại hai lần cho cùng tập package
- [ ] `verify` mặc định không import code bên thứ ba; `--deep` chạy trong tiến trình con có timeout
- [ ] `av skill verify` báo `ok` cho cả 22 skill, và `ok` nghĩa là script chạy được thật
- [ ] `document-skills` (không khai báo ở nguồn) chạy được sau khi cài
- [ ] venv không nằm trong thư mục đóng dấu version; `av update` không mồ côi nó
- [ ] GC gỡ được venv không còn tham chiếu
- [ ] Script cài ra chạy được qua `av skill run`
- [ ] `pnpm test` xanh, `src/skill-env/` coverage ≥ 85%

## Risk Assessment

**Import-scan map sai module → package.** Tín hiệu: `PIL` → cài nhầm gói. Phản ứng: bản
nháp phải được người review trước khi vào lockfile — đó là lý do bước 3 tách khỏi bước 4.

**Pin phiên bản làm skill nguồn hỏng vì nó viết cho range.** Tín hiệu: script chạy lỗi API
với phiên bản đã pin. Phản ứng: pin ở phiên bản resolve được tại thời điểm port (khớp thứ
nguồn đang chạy trên máy này), không pin ở phiên bản mới nhất.

**Venv chung vẫn có thể xung đột giữa 22 skill.** Tín hiệu: bước 4 resolve không ra tập
tương thích. Phản ứng: tách venv riêng cho đúng skill xung đột; giữ chung cho phần còn lại.
Ngân sách đĩa: 383MB là baseline nguồn, không phải mục tiêu.

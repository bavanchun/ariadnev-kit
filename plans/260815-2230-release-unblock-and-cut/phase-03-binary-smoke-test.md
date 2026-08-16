---
phase: 3
title: "Smoke test binary thay cho cổng"
status: completed
priority: P1
effort: "2h"
dependencies: [2]
---

# Phase 3: Smoke test binary thay cho cổng

## Overview

Thay thứ cổng consumer *định* chứng minh (release này dùng được) bằng phép kiểm rẻ mà thật:
chạy chính binary vừa build, kiểm exit code và output. Với một CLI dùng riêng, consumer
chính là máy của bạn.

## Requirements

- Functional: mỗi binary build cho nền tảng chạy được trên runner phải được chạy thật, kiểm
  exit code 0 và output khớp version đang release.
- Non-functional: smoke test phải **fail được** — chứng minh bằng test tiêm binary hỏng.
  Không được tự bỏ qua im lặng khi không chạy được binary cross-platform.

## Architecture

`build-binaries.mjs` build 5 target: `darwin-arm64`, `darwin-x64`, `linux-arm64`,
`linux-x64`, `windows-x64.exe`. Runner CI chỉ chạy được **một** trong số đó. Đây là ranh
giới quan trọng, và cách xử lý nó quyết định smoke test có giá trị hay chỉ là trang trí:

- Binary **khớp nền tảng runner** → chạy thật, kiểm exit code + output.
- Binary **không khớp** → *không* chạy, nhưng cũng không im lặng: kiểm file tồn tại, kích
  thước > 0, **và magic byte đúng định dạng của target** — Mach-O (`0xCFFAEDFE`), ELF
  (`0x7F ELF`), PE (`MZ`). Rồi ghi rõ trong log là "không chạy được trên runner này". Skip
  phải là một phát biểu khẳng định, không phải rơi ra từ nhánh lỗi.

Magic byte đáng thêm vì nó bắt đúng nhóm lỗi mà "tồn tại và > 0 byte" bỏ sót: build nhầm
target, đặt nhầm tên file, hoặc file bị cắt cụt. ~10 dòng.

Độ phủ thật là **2/5**, không phải 1/5: CI (ubuntu x64) chạy `ariadnev-linux-x64`, còn bước
chạy tay trên máy ở bước 5 chạy `darwin-arm64`.

Phép kiểm cụ thể trên binary khớp nền tảng:

1. `<binary> --version` → exit 0, stdout chứa đúng version đang release.
2. `<binary> list` → exit 0, output không rỗng — chứng minh kit nhúng bung ra được, tức là
   phần dễ hỏng nhất của binary (self-extract kit) thật sự chạy.

Bước 2 mới là phần đáng giá: `--version` chỉ chứng minh binary khởi động; `list` chứng minh
1454 file kit giải nén và parse được.

Chỗ đặt: script riêng `packages/cli/scripts/smoke-release-binaries.mjs`, gọi từ
`release-candidate-build.yml` ngay sau step "Build release assets". Script riêng thay vì
inline trong YAML vì nó cần test — và test được là điều kiện để tin nó.

## Related Code Files

- Create: `packages/cli/scripts/smoke-release-binaries.mjs`
- Create: `packages/cli/scripts/smoke-release-binaries.test.mjs`
- Modify: `.github/workflows/release-candidate-build.yml` — thêm step "Smoke the built
  binaries" sau step build
- Modify: `packages/cli/package.json` — thêm script `smoke:release`

## Implementation Steps

1. Viết test trước (`smoke-release-binaries.test.mjs`), phủ ba trường hợp:
   - thư mục có binary khớp nền tảng chạy được → pass;
   - binary khớp nền tảng nhưng exit khác 0 hoặc output sai version → **fail**;
   - binary không khớp nền tảng → pass nhưng báo cáo ghi rõ đã bỏ qua và vì sao.
   Dùng script shell/stub thay cho binary thật để test chạy nhanh và không cần build.
2. Viết `smoke-release-binaries.mjs`: nhận thư mục release + version mong đợi, tự xác định
   target khớp nền tảng từ `process.platform` + `process.arch`, chạy hai lệnh, in báo cáo
   dạng dòng rõ ràng, exit khác 0 khi bất kỳ phép kiểm nào hỏng.
3. Đặt timeout cho mỗi lời gọi binary (bung kit lần đầu tốn thời gian nhưng không được treo
   vô hạn). Chọn ngưỡng rộng — nó chặn treo, không đo tốc độ.
4. Nối vào `release-candidate-build.yml` sau step build, trước step tạo attestation.
5. Chạy thật một lần trên máy. **Không dùng `pnpm --filter ariadnev build:binary`** — script
   đó sinh ra `dist/ariadnev`, không phải bố cục asset `ariadnev-{os}-{arch}` mà smoke
   script tìm. Chạy trọn `build-binaries.mjs` (cần `--source-sha`, `--generated-at`,
   `--source-date-epoch`, `--previous-source-*`), rồi smoke lên `dist/release/`. Phase 4 dù
   sao cũng cần một lần build đủ 5 target để đo kích thước.
6. `pnpm test`, `pnpm lint`, brand-drift.
7. Commit: `test(release): smoke the built binaries in place of the consumer gate`.

## Success Criteria

- [ ] `smoke-release-binaries.mjs` chạy binary khớp nền tảng và kiểm cả `--version` lẫn `list`
- [ ] Test chứng minh script **fail** khi binary hỏng — không chỉ chứng minh nó pass
- [ ] Binary không khớp nền tảng được báo cáo tường minh, không im lặng, và magic byte được
      kiểm đúng định dạng target
- [ ] Chạy thật với `dist/release/` sinh từ `build-binaries.mjs` (không phải `build:binary`) → pass
- [ ] Step mới có trong `release-candidate-build.yml` trước bước attestation
- [ ] `pnpm test` xanh, `pnpm lint` xanh, brand-drift clean

## Risk Assessment

**Rủi ro: smoke test quá hẹp, pass nhưng binary vẫn hỏng ở nơi khác.**
Tín hiệu: binary hỏng trên máy thứ hai dù smoke xanh.
Phản ứng: mở rộng phạm vi smoke (thêm lệnh, thêm nền tảng qua matrix runner) trước, không
vội quay lại cổng consumer đầy đủ.

**Rủi ro: chỉ 1/5 binary được chạy thật.**
Tín hiệu: đây là hạn chế đã biết ngay từ đầu, không phải bất ngờ.
Phản ứng: chấp nhận. Muốn phủ hết cần matrix runner đa nền tảng — chi phí lớn hơn giá trị
cho một tool cá nhân. Nếu sau này thật sự cài trên Linux/Windows và gặp lỗi, lúc đó thêm
matrix, có bằng chứng cụ thể để biện minh.

**Rủi ro: bung kit lần đầu chậm làm step timeout.**
Tín hiệu: step đỏ với timeout dù binary lành.
Phản ứng: nâng ngưỡng timeout — nó tồn tại để chặn treo, không để đo tốc độ. Đây là lỗi
tương tự đã gặp ở deep-import của skill-env (30s → 120s).

---
phase: 3
title: Docs + cross-provider smoke-test + first-publish runbook
status: completed
priority: P2
effort: 2-3h
dependencies:
  - 1
  - 2
---

# Phase 3: Docs + cross-provider smoke-test + first-publish runbook

## Overview
Sửa README cho khớp thực tế (npm install), thêm smoke-test script chạy `install --dry-run`
cho cả 6 provider trên tarball đã pack, và viết runbook cho các bước user tự làm tay.

## Requirements
- Functional: 1 lệnh smoke-test pack tarball → cài isolated → `install --dry-run` 6 provider, assert exit 0.
- Non-functional: script chạy local + có thể gọi trong CI; README không over-promise.

## Architecture
- Smoke-test = node script độc lập (giống `verify-package-tarball.mjs`): `npm pack` → extract temp → `npm install` tarball vào temp prefix → chạy `dist/index.js install --provider <p> --dry-run --cwd <tmp-proj> --yes` cho từng provider → assert exit code 0.
- Runbook = file markdown trong plan/repo docs nêu rõ ranh giới "user tự làm" vs "tự động".

## Related Code Files
- Modify: `README.md` — mục "Install" (npm + fallback tarball/git), bỏ over-promise; cập nhật bảng commands nếu cần.
- Create: `packages/cli/scripts/smoke-test-all-providers.mjs`
- Modify: `packages/cli/package.json` — thêm script `"smoke-test": "node scripts/smoke-test-all-providers.mjs"`.
- Create: `docs/deployment-guide.md` (hoặc cập nhật nếu có) — first-publish runbook + prerequisites.
- (Tùy) Modify: `.github/workflows/ci.yml` — thêm step gọi smoke-test sau build (cân nhắc thời gian CI).

## Implementation Steps
1. Viết `smoke-test-all-providers.mjs`: lặp 6 provider `["claude-code","codex","cursor","opencode","antigravity","generic"]`, mỗi provider cài tarball vào temp prefix riêng, chạy `install --dry-run`, kiểm tra exit 0 + (nhẹ) grep log "skip" cho ô unverified. Cleanup temp. Report bảng pass/fail.
2. Chạy `pnpm --filter vcskill run smoke-test` local, sửa cho tới khi cả 6 provider pass.
3. Sửa `README.md`:
   - Mục "Install from npm" (`npx vcskill install`) — ghi rõ "available after first publish".
   - Mục fallback: tarball (`npm i -g ./vcskill-x.y.z.tgz`) + git clone+build.
   - Rà bảng provider matrix khớp `spec-verified.ts` (skip cells đúng).
4. Viết runbook `docs/deployment-guide.md`:
   - **User tự làm tay:** (a) đăng nhập npm; (b) tạo Automation token → GitHub repo Settings → Secrets → `NPM_TOKEN`; (c) [fallback] publish tay lần đầu để claim tên: `cd packages/cli && npm publish --access public`.
   - **Tự động (Changesets):** vòng đời `pnpm changeset` → merge Version PR → GHA publish.
   - Bảng phân định rõ ranh giới.
5. (Tùy, KISS) thêm smoke-test vào CI nếu thời lượng chấp nhận; nếu chậm, để chạy local + trong release.yml trước publish.
6. Whole-plan consistency: rà README ↔ matrix ↔ spec-verified.ts không mâu thuẫn.

## Success Criteria
- [ ] `smoke-test-all-providers.mjs` pass cả 6 provider (exit 0, không crash).
- [ ] README có mục npm install + fallback, không còn over-promise `npx vcskill` đang chạy.
- [ ] `docs/deployment-guide.md` nêu rõ prerequisites user tự làm + vòng đời Changesets.
- [ ] (nếu thêm CI) CI vẫn xanh và không tăng thời lượng quá mức.

## Risk Assessment
- Risk: smoke-test phụ thuộc `npm install` tarball trong CI → chậm. Mitigation: ưu tiên chạy trong release.yml (trước publish) + local; CI PR có thể bỏ qua.
- Risk: README/matrix lệch `spec-verified.ts` theo thời gian. Mitigation: bước 6 consistency; tham chiếu single-source.
- Open: có muốn smoke-test gate luôn `ci.yml` (mọi PR) hay chỉ `release.yml`? (đề xuất: release.yml để giữ PR nhanh.)

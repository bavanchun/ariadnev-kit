# Brainstorm — Hoàn thiện vcskill để dùng trên máy khác (npm public)

Date: 2026-06-10 · Status: agreed, ready for /ck:plan

## Problem statement
vcskill engine hoàn chỉnh (add-skill/install/adapt/migrate, 85/85 test pass, tarball verify pass)
nhưng CHƯA publish npm (`npm view vcskill` → 404). README quảng cáo `npx vcskill install` —
lệnh này hiện lỗi ở máy lạ. Cần hoàn thiện kênh phân phối + metadata để máy khác cài & test được.

## Verified facts (codebase scout)
- Core OK: add-skill-command.ts, install/, adapt/ (pure), spec-verified.ts gating; 85 test pass.
- `verify-tarball` pass: dist+kit+shebang+bin đúng; resolveKitRoot xử lý cả dev + flat published.
- CI `.github/workflows/ci.yml` = lint·build·test·coverage. KHÔNG có release job.
- GitHub remote: `bavanchun/vcskill`. Name `vcskill` còn trống trên npm.
- THIẾU: LICENSE, publishConfig, repository/homepage/keywords, release workflow.

## Decisions (user-confirmed)
| Quyết định | Chọn |
|---|---|
| Kênh phân phối | **npm public**, tên `vcskill` (không scope) |
| Mức hoàn thiện | **Tự động hóa release** (full polish + GHA auto-publish) |
| Cơ chế release | **Changesets** (PR-based version + changelog; publish qua NPM_TOKEN) |
| License | **MIT** |
| Smoke-test | **Cả 6 provider**: claude-code, codex, cursor, opencode, antigravity, generic |

## Scope
- **In:** package metadata, LICENSE (MIT), README khớp thực tế, Changesets setup, release workflow, smoke-test toàn provider.
- **Out (YAGNI):** hooks, skillsmp.com, provider mới, skill content mới, đụng adapt engine / spec-verified gating.

## Acceptance criteria
1. Máy sạch: `npx vcskill@latest install --provider claude-code --dry-run` chạy, resolve kit đúng.
2. Merge "Version Packages" PR (Changesets) → GHA tự build → verify-tarball → `npm publish` (provenance).
3. CI cũ vẫn xanh; engine thuần + gating không đổi.
4. `install --dry-run` chạy sạch cho cả 6 provider (skip-unverified log đúng, không crash).

## Công việc (5 nhóm)
1. **Metadata** `packages/cli/package.json`: thêm `license:"MIT"`, `repository`, `homepage`, `bugs`,
   `keywords`, `author`, `publishConfig:{access:"public",provenance:true}`. `files` giữ nguyên.
2. **LICENSE** (MIT) ở root + (tùy) copy/đảm bảo có trong tarball.
3. **README**: thêm mục "Install from npm"; làm rõ `npx vcskill` đúng sau publish; giữ fallback tarball/git.
4. **Changesets**: `@changesets/cli` + `.changeset/config.json` (single package, baseBranch main);
   workflow `release.yml` dùng `changesets/action` (version PR + publish), cần secret `NPM_TOKEN`.
5. **Smoke-test**: `npm pack` → cài temp prefix → `install --dry-run` cho cả 6 provider; assert exit 0 + log skip đúng.

## Prerequisites (USER tự làm tay — Claude không làm thay được)
- [ ] Tạo / đăng nhập npm account (`npm adduser` hoặc trên npmjs.com).
- [ ] Tạo npm **Automation token**, thêm vào GitHub repo secrets là `NPM_TOKEN`.
- [ ] (publish lần đầu có thể cần chạy tay 1 lần để claim tên `vcskill`, sau đó Changesets lo tiếp.)

## Risks / trade-offs
- Changesets cho 1-package-solo = hơi nặng nghi thức (changeset-per-change + Version PR). Chấp nhận để có changelog auto.
- OIDC trusted publishing không dùng (Changesets hợp NPM_TOKEN hơn) → có token dài hạn trong secrets; mitigate bằng Automation token + provenance.
- README đang over-promise `npx vcskill`; phải sửa trước/đồng thời publish để tránh hiểu nhầm.

## Open questions
- Version khởi điểm publish: giữ `0.1.0` hay nhảy `0.1.1`/`1.0.0`? (đề xuất: publish `0.1.0` làm mốc, Changesets bump từ đó.)
- Root monorepo `private:true` — giữ private (chỉ publish `packages/cli`). Xác nhận không publish root.

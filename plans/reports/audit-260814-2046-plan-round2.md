# Audit vòng 2 — plan AgentKit → ariadnev

Date: 2026-08-14 · Plan: `plans/260814-1829-agentkit-full-port/`
Phạm vi: phase 2 và 8 (viết sau red-team, chưa từng review) + audit độ phủ toàn plan
Findings: 12 red-team + 18 gap độ phủ. Đã verify độc lập mọi con số.

## A. Lỗi tôi tự gây khi renumber (đã sửa)

| Lỗi | Trạng thái |
|---|---|
| ~28 tham chiếu "phase N" trong thân bài dùng số cũ | Đã sửa |
| Bảng "Áp vào" của Red Team Review dùng số cũ | Đã sửa |
| Bảng rủi ro `plan.md` vẫn ghi phản ứng "grandfather" — trái quyết định tự verify | Đã sửa |
| `~/.cache/vcskill` trong bảng rủi ro | Đã đổi `ariadnev` |

## B. Số liệu sai trong plan (cần sửa)

| Hạng mục | Plan ghi | Thực tế | Nguồn |
|---|---|---|---|
| Hook top-level | 22 | **17** (15 `.cjs` + 2 `.sh`) | `~/.claude/hooks/` |
| Module `_lib` | 34 | **28** | `find ~/.claude/hooks/lib -name "*.cjs"` |
| Symlink trong nguồn | 14 | **0** trong `ak-*` (14 cái ở skill ngoài scope) | `find ~/.claude/skills/ak-* -type l` |
| File chứa `vcskill` cần đổi | 130 | **205** (chưa tính `plans/`) | grep repo |
| Occurrence `vc:` | — | **~1700** | grep `kit/` + `src/` |

Ba con số đầu nằm nguyên văn trong success criteria — checkbox không thoả được như đang viết.

## C. Critical — phase 2 (rebrand)

### C1. Rename bỏ rơi toàn bộ state đã có trên đĩa
`~/.vcskill/` và `~/.cache/vcskill/{0.6.0,0.9.0,0.10.0,0.11.0}` **đang tồn tại trên máy này**.
Sau rename, `av uninstall` đọc `.ariadnev/receipt.json`, không thấy, no-op. Mọi file bản cũ
đã ghi vào `.claude/`, `.codex/`, `.cursor/` thành mồ côi — kể cả backup, thứ duy nhất khôi
phục được. Phase 2 bước 1 để ngỏ ("gỡ tay hay lệnh hỗ trợ") và không phase nào giải quyết.
Evidence: `install-execute.ts:83,94`, `uninstall-execute.ts:147`, `history/store.ts:11`,
`migrate/applied-state.ts:6`, `embedded-kit.ts:14`.

### C2. Repo đã có cơ chế migration mà phase 2 không dùng
`portable-manifest.json` có `renames` + `providerPathMigrations`, tiêu thụ bởi
`plan-migrations.ts`, và **đã có tiền lệ thật**: antigravity `.agent/skills` → `.agents/skills`
since `0.2.0`. Phase 2 đổi tên 13 agent `vc-*` → `av-*` và cả namespace `vc:` mà thêm 0 entry.
Hệ quả: 13 file `vc-*.md` cũ thành unowned, `av audit` không thấy, Claude Code vẫn nạp →
người dùng có 26 agent, một nửa là bản chết.
Evidence: `portable-manifest.json:4-13`, `plan-migrations.ts:32`, `install-receipt.ts:139-141`.

### C3. Rename phá pipeline release
`resolve-previous-stable.mjs:33` glob `vcskill@*`; 7 tag hiện có đều khớp. Sau rename thành
`ariadnev@0.13.0`: hoặc vẫn glob cũ và resolve ra tag có asset tên `vcskill-darwin-arm64` →
fail assertion ở `release-candidate-publish.yml:112`; hoặc đổi glob và ném
`no previous stable release exists` ở dòng 47. Phase 2 chỉ liệt kê `ci.yml`, bỏ sót 4 workflow
khác, 4 JSON schema (`$id` là `https://vcskill.dev/...`), ~10 release script, và repo consumer
ngoài `bavanchun/vcskill-web` (pinned làm `const` trong schema — không đổi đơn phương được).

### C4. Chuỗi brand là **dữ liệu đã ghi**, không phải chỉ định danh
- `agents-md.ts:3-4`: `<!-- vcskill:start -->` / `<!-- vcskill:end -->` là marker trong
  AGENTS.md của người dùng. Đổi marker → `stripAgentsBlock` không khớp block cũ →
  `mergeAgentsBlock` **nối thêm block thứ hai**, mỗi lần cài thêm một block.
- `install-receipt.ts:42,55`: `vcskillVersion` là key JSON đã ghi; `update-command.ts:88`
  đọc nó. Đổi tên → cảnh báo "receipt ghi bởi bản khác" im lặng ngừng hoạt động.
Phase 2 khẳng định "thuần đổi tên, không đổi hành vi" — sai với hai thứ này.

### C5. `.gitignore` chỉ có `.vcskill/`
`.gitignore:7`. Sau rename, `.ariadnev/` chưa ignore → chứa receipt (đường dẫn tuyệt đối)
và `backups/` (bản sao **file gốc của người dùng** mà installer ghi đè). `git add -A` trong
repo công ty là rò dữ liệu, do rename tạo ra.

### C6. Gate `check-brand-drift` không phủ nơi brand thật sự nằm
Scope khai báo là `src/`, `kit/`, `docs/`, file cấu hình — loại `.github/`, `scripts/`,
`evals/`, `install.sh`, `install.ps1`, `.changeset/`, `SECURITY.md`, `README.md`. Pattern
cũng thiếu `vcskill.dev` (khác `vchun.dev`) và `bavanchun/vcskill`. Gate về 0 trong khi
`install.ps1:1-5` vẫn tải `vcskill-windows-x64.exe` từ `vcskill.vchun.dev` → Windows 404.

### C7. Tiêu chí "gate về 0" không thoả được nếu không có allowlist
`evals/baselines/v0.10.0/README.md:26` ghi `vcskill@0.10.0` + commit + tree hash làm baseline
đóng băng. Sed đổi thành `ariadnev@0.10.0` — tag chưa từng tồn tại, hash mâu thuẫn → baseline
thành bản ghi giả. Tương tự `docs/decisions/0001-*`, `docs/journal/*`. Cần allowlist tường minh.

## D. Critical — phase 8 (provider)

### D1. Mâu thuẫn nội tại
Non-functional dòng 34: "không hạ cấp ô đang chạy tốt". Bước 2: provider không cài được →
hạ về `unverified` = skip. Hai điều không cùng đúng. Thực tế: `antigravity` không có trên máy
này, `generic` **không phải sản phẩm** — nó là layout `.agents/` trung tính, không có consumer
để quan sát. Áp bước 2 trung thực → `av install --provider generic` ghi 0 file.

### D2. Whitelist event sẽ reject hook mà kit đang ship
`kit/hooks/subagent-init/hook.json:2` bind `SubagentStart` — **không** nằm trong tập event
Claude Code tài liệu hoá. Whitelist soạn từ docs → `load-kit.ts` ném `KitValidationError` cho
chính kit hiện tại, `av validate` đỏ, chặn phase 9-13. Bước 6 chỉ test chiều reject, không
test chiều 6 hook hiện có vẫn qua.

### D3. Success criteria trái quyết định của chính phase
Dòng 43 chốt "không grandfather"; dòng 96 lại yêu cầu "ADR ghi rõ ô nào grandfather và vì sao".
Executor theo checklist sẽ tái lập grandfather và trích lại chính hai file generator ma.

### D4. Dependency thiếu
Frontmatter `dependencies: [2]`, nhưng bước 4 re-derive ô `scripts` dưới ngữ nghĩa script
thực thi per-skill mà **phase 7** giới thiệu. Phải là `[2, 7]`.

## E. Gap độ phủ — 18/36 hạng mục nguồn không có phase nào nhận

Xếp theo hậu quả:

| # | Hạng mục | Hậu quả |
|---|---|---|
| 1 | `hooks.json` (237 dòng, 8 event / 21 binding) | Mô hình per-hook `hook.json` của vcskill không biểu diễn được **thứ tự trong matcher group** (`Stop` 3 binding, `UserPromptSubmit` 6) và `args` tuỳ biến → mất thứ tự thực thi, mất binding |
| 2 | Bộ artifact adapter: `install-manifest`, `native-skill-paths`, `native-skill-hashes`, `native-hook-expectations`, `codex/cursor-ownership.json` | Đây là cách AgentKit theo dõi thứ nó sở hữu trong cây provider và phát hiện drift. `av audit` (phase 6) chỉ đọc receipt của chính mình → yếu hơn nguồn |
| 3 | Statusline: `statusline-custom.cjs`, `ak-engineer-statusline.cjs`, 5 module `statusline-*` trong `_lib` | Phase 9 port module rồi hoãn "nhóm statusline" không có phase kế → 5 module mồ côi, tính năng người dùng thấy được bị bỏ im lặng |
| 4 | `output-styles/coding-level-{0..5}.md` (6 file) | `ak-coding-level/SKILL.md:67` nói runtime phát các file này ra `output-styles/` của provider — skill vô dụng nếu thiếu. `kit-types.ts` không có artifact kind nào chứa được chúng |
| 5 | 2 hook `.sh` (`herdr-agent-state.sh`, `typeburn-protect-main.sh`) | `load-kit.ts` bắt buộc `hook.cjs` mỗi thư mục → hoặc bị bỏ im lặng, hoặc buộc sửa loader giữa phase 9 |
| 6 | 13 agent distill chưa được thay bằng bản nguồn | Quyết định "thay hết bằng bản đầy đủ" áp cho skill và rules, **không** áp cho agent. Tiêu chí "16 agent" thoả được về số trong khi 13 cái vẫn là bản nén |
| 7 | `settings.json` (25 tham chiếu `hooks/` + `statusLine`) | Không phase nào đọc |
| 8 | Changeset / release cho package đổi tên; nội dung docs (provider matrix, authoring spec) | Phase 2 chỉ sed đổi tên `docs/**`; kit đi từ 26→103 skill làm authoring spec và provider matrix **sai nội dung**, không chỉ sai tên |
| 9 | `ck-config.schema.json` của nguồn | Phase 10 thiết kế config schema từ đầu mà không đọc schema nguồn |
| 10 | 5 script adapter (`resolve_env.py`, `set-active-plan.cjs`, `worktree.cjs`, `validate-skill-crossrefs.py`) | Nguồn cài chúng vào mọi cây provider; nằm ngoài cả 154 script skill lẫn mọi phase |
| 11 | `notifications/lib/env-loader.cjs`, `hooks/docs/*`, `notifications/docs/slack-hook-setup.md` | Phase 9 liệt kê 5/6 file notification |
| 12 | `.claude/commands/term-config.md` | `ArtifactType` có `"command"` nhưng `kit/commands/` không tồn tại, không phase nào tạo |
| 13 | E2E install test xuyên provider | Bằng chứng phase 8 là ảnh chụp một lần, chụp **trước** khi phase 9-13 sửa `install-plan.ts` |

## F. Effort

Phase 2 hiện 3d, dựa trên tiền đề "130 file" — thực tế 205 file, ~1700 occurrence `vc:`,
cộng migration dữ liệu (C1), migration release (C3), đổi schema đã ghi (C4). Đề xuất **6d**.
Phase 8 giữ 7d nhưng chỉ khi giải quyết D1 trước — 42 ô × phương pháp quan sát chưa định nghĩa,
trên máy chỉ cài được một phần provider.

Tổng ước lượng cập nhật: 54d → **~62d** (chưa tính các hạng mục mục E được nhận thêm).

## Câu hỏi cần người dùng quyết

1. Bộ artifact adapter (E-2): port hay tuyên bố non-goal? Receipt của vcskill đã làm việc
   tương đương ở dạng khác.
2. Statusline (E-3): port hay bỏ?
3. `output-styles` (E-4): thêm artifact kind mới hay bỏ?
4. 13 agent distill (E-6): thay bằng bản nguồn như đã làm với skill?
5. State cũ trên máy (C1): migration dual-read hay clean break (xoá `~/.vcskill`, `~/.cache/vcskill`)?
6. Version: tiếp tục `ariadnev@0.13.0` hay reset `0.1.0`?
7. Repo `bavanchun/vcskill-web`: đổi tên hay giữ?

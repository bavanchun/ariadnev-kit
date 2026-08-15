---
status: completed
effort: xl
branch: main
blockedBy: []
blocks: []
---

# AgentKit 2.12.0 → ariadnev full port

## Outcome

`ariadnev` (alias `av`, domain `ariadnev.com`) chứa toàn bộ năng lực của AgentKit 2.12.0
dưới thương hiệu riêng: 103 skill (kèm asset nhị phân và 154 script chạy được), 16 agent,
rules, 14 hook + 18 module `_lib`, kiểm toàn vẹn cài đặt, user config schema, và CLI mở
rộng — cài được cho các provider tự verify được, bằng quan sát thật chứ không kế thừa niềm
tin.

Dùng riêng tư, cá nhân. Repo private.

### Định danh (chốt 2026-08-14)

| Hạng mục | Giá trị |
|---|---|
| Binary / package | `ariadnev` |
| Alias ngắn | `av` |
| Prefix env | `ARIADNEV_*` |
| Namespace skill / agent | `av:` / `av-` |
| Domain | `ariadnev.com` |

Bảng đầy đủ và kế hoạch đổi tên ở `phase-02`.

### "Zero định danh AgentKit" — diễn giải

Yêu cầu "không sót ký tự `ak`" được thực thi như: **zero định danh có nguồn gốc AgentKit**
— `ak:`, `ak-`, `AGENTKIT_*`, `AgentKit`, `~/.agentkit`, và mọi lời gọi binary `ak`. Grep
literal hai ký tự `ak` không khả thi vì nó nằm trong từ tiếng Anh thông thường ("m**ak**e",
"bre**ak**"). Gate CI ở phase 2 và 11/12 kiểm theo danh sách định danh, kiểm chứng được.

## Constraints

- TDD: viết test đỏ trước. `pnpm test` phải xanh sau mỗi phase — và **trong** mỗi phase,
  không được để suite đỏ kéo dài qua nhiều bước.
- Adapt engine (`src/adapt/`) giữ nguyên tính pure — không fs, không network, ≥90% coverage.
- Path constants chỉ sống ở `src/adapt/paths.ts`.
- Ghi file luôn atomic (temp + rename), backup phải khôi phục được từng file.
- Cross-platform: `os.homedir()` / `path.join`, không hardcode `$HOME`.
- Ô `(provider, artifact)` chưa verify thì skip + log, không đoán đường dẫn.
- **Không tạo bản ghi state song song với `install-receipt.ts`.** Receipt là ownership
  record duy nhất; mọi nhu cầu mới mở rộng nó, không dựng file thứ hai.
- **Không mở rộng `Artifact` khi `skillFiles()` đã đủ.** Một walker, một ignore list.

## Non-goals

- Không publish công khai. Không phát hành npm.
- Không port nhóm CLI Tier-3 của AK: `gui`, `api`, `watch`, `content`, `content-search`,
  `sessions`, `activity`, `analytics`, `data`, `diagnostics`, `feedback`, `changelog`,
  `recover`, `migrate`, `login/logout/whoami/licenses`, `codex-agent-runtime`.
- Không clone hạ tầng license/auth của AgentKit.
- **Không làm matcher translation.** Hook chỉ cài được cho claude-code; translation là code
  không consumer. Thay bằng whitelist event name.

## Va chạm với 26 skill đã distill

103 skill nguồn, trong đó 25 đã có bản distill trong vcskill. **Quyết định (2026-08-14):
thay hết bằng bản đầy đủ.** Ledger `decisions.json` (791 claim) và lệnh `av coverage` đo
mức nén distill — khi mọi skill là bản sao nguyên văn thì phép đo mất nghĩa, và
`decisions.test.ts` (bắt ledger phản chiếu chính xác inventory) sẽ chặn mọi bước port.

Vì vậy việc gỡ hệ thống ledger/coverage là **phase 1**, không phải một bước trong phase
port. Chi tiết ở `phase-01`.

## Acceptance criteria

1. `av validate` xanh với **103 skill** (101 port + 2 của repo; `ak-ak` và `ak-plan-i18n`
   không port — xem phase 12), **16 agent** đều từ nguồn, **10 rules**, **14 hook** (đếm lại
   từ nguồn ở phase 9 — 17 là số file trong thư mục, gồm 3 file của tool khác), và các
   artifact kind mới (`outputStyle`, `command`).
2. `av install --provider <p>` chạy được cho mọi provider **verify được** (xem phase 08);
   ô chưa verify skip + log rõ.
3. `av skill verify` báo `ok` cho toàn bộ **22** skill Python, và "ok" nghĩa là import thật
   sự thành công, không phải hash khai báo khớp.
4. `av audit` phát hiện drift khi sửa tay một file đã cài.
5. File nhị phân **trên provider tree sau khi cài** byte-identical với nguồn (không phải chỉ
   ở cache).
6. Giết tiến trình giữa lúc install → `av uninstall` gỡ đúng số file đã ghi.
7. Ghi đè N file → backup chứa đúng N entry khôi phục được.
8. Zero tham chiếu `ak`/`AgentKit`/`AGENTKIT_*` trong kit và src.
9. Thứ tự binding hook sau khi cài khớp `hooks.json` gốc (8 event / **19 binding** —
   21 trừ 2 binding trùng lặp trong nguồn; xem phase 9).
10. Statusline hiện đúng ở cả 4 chế độ; 5 module `statusline-*` có consumer thật.
11. E2E cài + gỡ sạch cho mọi provider verified, chạy trong CI.
12. 5 artifact adapter sinh đúng schema nguồn, và **không code nào đọc chúng** để ra quyết định.

## Nguồn

- `plans/reports/scout-260814-1824-agentkit-full-clone-surface.md` — khảo sát bề mặt nguồn.
- `plans/reports/red-team-260814-1840-agentkit-full-port.md` — 23 finding đã adjudicate.

## Phases

| # | Phase | Ưu tiên | Phụ thuộc | Effort | Trạng thái |
|---|---|---|---|---|---|
| 1 | Freeze, rollback ref, gỡ ledger + coverage | P1 | — | 2d | **completed** |
| 2 | Rebrand → ariadnev (+ release pipeline, dữ liệu đã ghi) | P1 | 1 | 6d | **completed** |
| 3 | Kit schema + `outputStyle` + `commands` | P1 | 2 | 2d | **completed** |
| 4 | Đường nội dung nhị phân an toàn đầu-cuối | P1 | 2 | 3d | **completed** |
| 5 | Install bền: crash boundary + backup không đụng độ | P1 | 2 | 2d | **completed** |
| 6 | `av audit` như reader trên receipt | P1 | 5 | 1d | **completed** |
| 7 | Skill runtime env | P1 | 2 | 5d | **partial** |
| 8 | Bằng chứng provider (tự verify) + whitelist event | P1 | 2 | 7d | **completed** |
| 9 | Hook engine port (+ dịch `hooks.json`) | P2 | 8, 10 | 7d | **completed** |
| 10 | User config schema (tách quyền project/user) | P2 | 2 | 3d | **completed** |
| 11 | Port nội dung wave A — 27 skill độc lập | P2 | 3, 4, 5, 7 | 5d | **completed** |
| 12 | Port nội dung wave B — 76 skill + agents + rules | P2 | 11, 13 | 12d | **completed** |
| 13 | CLI Tier-1 + cây subcommand | P2 | 6, 7 | 4d | **completed** |
| 14 | Statusline | P2 | 9 | 3d | **completed** |
| 15 | Artifact adapter sinh từ receipt | P2 | 6 | 4d | **completed** |
| 16 | Docs, release, e2e install | P2 | 12, 13, 14, 15 | 4d | **completed** |

Tổng ước lượng: **70 ngày công** (54d sau red-team vòng 1 → 70d sau audit vòng 2:
phase 2 3d→6d, phase 3 1d→2d, phase 9 6d→7d, cộng 3 phase mới 14, 15, 16 = 11d).

**Lịch chạy: tuần tự 1→16** (quyết định 2026-08-14), với **một ngoại lệ do phụ
thuộc**: phase 9 khai `dependencies: [8, 10]`, nên **10 chạy trước 9** (2026-08-15).
Bảng liệt kê theo số, không phải theo thứ tự chạy. Nhiều phase chỉ phụ thuộc phase 2 nên
về lý thuyết chạy song song được, nhưng phase 4 và 5 cùng sửa `packages/cli/src/install/`
và sẽ xung đột. Tuần tự đổi lấy sự đơn giản và mỗi lúc chỉ một vùng code thay đổi.

Chu trình 9↔10 của bản cũ đã bị gỡ: 7 skill phụ thuộc binary nguồn nay nằm trọn trong
phase 12 với `dependencies: [11, 13]`, không còn "làm dở rồi quay lại".

## Rủi ro đã biết

| Rủi ro | Tín hiệu nhận biết | Phản ứng đã chọn |
|---|---|---|
| Không dựng được môi trường để verify một provider | Phase 8 không cài nổi antigravity hoặc opencode trên máy này | Hạ ô về `unverified` kèm lý do — installer skip + log. Chấp nhận bảng có ô trống hơn bảng đẹp mà sai |
| Tự verify làm lộ đường dẫn hiện tại đang sai | Phase 8 quan sát thấy path thật khác `resolver.ts` | Sửa theo quan sát; ghi breaking change vào ADR + changeset |
| Binary phình quá mức khi nhúng 16.8MB | Binary > 120MB hoặc materialize > 800ms | Sidecar archive tải lười (phase 4) |
| 12 skill Python không có khai báo dependency | Đã biết trước, không phải rủi ro — là công việc ở phase 7 | Tool scan import tự sinh khai báo, người review |
| venv 383MB nhân theo mỗi version | `~/.cache/ariadnev` vượt 1GB | venv ngoài root đóng dấu version + GC (phase 7) |
| Khối lượng phase 12 quá tải | Vượt 60% thời lượng dự kiến | `cti-expert` + `document-skills` tách sang phase riêng với acceptance độc lập |
| Rebrand sót chỗ chỉ lộ lúc runtime | Gate grep xanh nhưng cài thử lỗi | Phase 2 bước 8 cài thử thật là bắt buộc, không chỉ dựa vào grep |

## Red Team Review

### Session — 2026-08-14
**Findings:** 23 sau dedupe (37 thô), 23 accepted, 0 rejected
**Severity breakdown:** 11 Critical, 4 High, 8 Medium/High secondary
**Evidence filter:** 0 loại — mọi finding có `file:line`
Báo cáo đầy đủ: `plans/reports/red-team-260814-1840-agentkit-full-port.md`

| # | Finding | Mức | Disposition | Áp vào |
|---|---|---|---|---|
| C1 | Sửa nhúng nhị phân không cứu đường ghi ra đĩa (3 hop còn `utf8`) | Critical | Accept | Phase 4 |
| C2 | Phase 4 cũ phát minh lại ownership record đã có trong receipt | Critical | Accept | Phase 6 (thu hẹp) |
| C3 | Gỡ `av coverage` phá `av validate`; 11 consumer, không phải 3 | Critical | Accept | Phase 1 |
| C4 | `decisions.test.ts` làm phase port đỏ ngay bước đầu | Critical | Accept | Phase 1 |
| C5 | Crash giữa install → không receipt → uninstall no-op | Critical | Accept | Phase 5 |
| C6 | Backup key theo `kind/basename` gộp 1511 file thành vài chục | Critical | Accept | Phase 5 |
| C7 | Ghi đè 25 skill distill không có điểm rollback | Critical | Accept | Phase 1 |
| C8 | 154 script port nguyên trạng không qua cổng nào | Critical | Accept | Phase 11 |
| C9 | Khai báo dependency không tồn tại; venv chung; `verify` import code | Critical | Accept | Phase 7 |
| C10 | Cascade config đảo ngược biện pháp bảo mật của `env-scope.ts` | Critical | Accept | Phase 10 |
| C11 | Matcher translation không consumer; hazard thật là event name | Critical | Accept | Phase 8 (đổi hướng) |
| H1 | `Artifact` không cần đổi — `skillFiles()` đã duyệt cây tuỳ ý | High | Accept | Phase 3 |
| H2 | Bằng chứng verify provider không tồn tại; cổng mới làm hỏng provider đang chạy | High | Accept | Phase 8 |
| H3 | venv 383MB trong cache đóng dấu version; script cài ra 0644, shebang không trỏ venv | High | Accept | Phase 7 |
| H4 | Cache sentinel verify một lần, đua tiến trình; cổng khởi động đo nhầm; generator theo symlink | High | Accept | Phase 4 |
| S1 | `trust.passphrase` plaintext, `resolve --json` in ra | High | Accept | Phase 10 |
| S2 | Secret notification vượt sanitizer (hook là tiến trình riêng, token trong path URL) | High | Accept | Phase 9 |
| S3 | Đích webhook đặt được bởi project file — kênh exfil | High | Accept | Phase 9, 10 |
| S4 | `notifications/` bị loader reject; ngân sách 150ms không đạt được | High | Accept | Phase 9 |
| S5 | Exit code mới phá hợp đồng CI của `doctor`; `av kit validate` trùng | High | Accept | Phase 13 |
| S6 | `av run <skill>` đụng subcommand đang có; chưa có skill runner | High | Accept | Phase 13 |
| S7 | `adapt-decision-log.ts` là bề mặt log thứ ba | Medium | Accept | Phase 8 (bỏ) |
| S8 | Chu trình 9↔10; config command hai chủ; số rules sai | Medium | Accept | plan.md, 10, 12, 13 |

Một đính chính: bằng chứng gốc của C7 nói `kit/skills` chỉ có 1 commit — sai, thực tế 21
commit. Lõi finding vẫn đứng: không có ref rollback chuyên dụng, và plan history-rewrite
destructive vẫn `pending`.

### Whole-Plan Consistency Sweep
- Files reread: `plan.md` + 12 phase file mới
- Decision deltas checked: 23
- Reconciled stale references:
  - Cấu trúc phase viết lại hoàn toàn (10 → 12 phase); mọi phase file cũ đã xoá
  - Tiêu chí đo cache → đo provider tree sau khi cài (criterion 5)
  - "23 skill Python" → 22 (đếm lại từ nguồn)
  - "8 rules" → bảng before/after ở phase 11, con số chốt ở bước 1 của phase đó
  - Matcher translation gỡ khỏi phase 7 và thêm vào non-goals
  - Phase 4 cũ (manifest/ownership song song) → phase 5 mới đọc receipt; ràng buộc "không
    tạo bản ghi state song song" thêm vào Constraints
  - Chu trình 9↔10 gỡ; 7 skill phụ thuộc binary gom vào phase 11 `dependencies: [10, 12]`
  - `av run` overload → `av skill run`; exit code retrofit → chỉ áp lệnh mới
  - Bảng phụ thuộc trong `plan.md` lệch frontmatter phase 11 (`10` vs `[10, 12]`) — đã sửa
- Unresolved contradictions: 0

## Validation Log

### Session 1 — 2026-08-14
Verification Pass bỏ qua theo guard: `## Red Team Review` đã có bằng chứng đầy đủ
(24/24 đường dẫn VERIFIED, 0 FAILED, evidence filter loại 0/23 finding).
Câu hỏi đã hỏi: 5. Quyết định đã chốt:

| # | Quyết định | Ảnh hưởng |
|---|---|---|
| 1 | `260814-1717-main-history-rewrite` → **cancelled**; `260814-1615` → completed | Phase 1 bước 2; loại nguy cơ force-push làm mất ref rollback |
| 2 | Skill `git` **thay bằng bản nguồn**, không giữ fork `ck:git` | Phase 12; tổng 103 skill đều từ nguồn; tuỳ biến cũ lấy lại từ tag `pre-agentkit-port` nếu cần |
| 3 | Provider: **tự verify lại từ đầu**, không grandfather | Phase 8 effort 3d → 7d; bằng chứng là quan sát thật có ngày + phiên bản |
| 4 | Lịch chạy **tuần tự 1→13** | Tránh xung đột phase 4/5 cùng sửa `install/` |
| 5 | Rebrand → **`ariadnev`** / `av` / `ARIADNEV_*` / `av:` | Phase 2 mới chèn vào; toàn bộ phase cũ renumber 2-12 → 3-13 |

Diễn giải đã thống nhất: "zero ký tự `ak`" thực thi như "zero định danh nguồn gốc
AgentKit" — grep literal hai ký tự không khả thi vì chúng nằm trong từ tiếng Anh thường.

### Whole-Plan Consistency Sweep — sau validate
- Files reread: `plan.md` + 13 phase file
- Decision deltas checked: 5
- Reconciled stale references:
  - Chèn phase 2 (rebrand); renumber toàn bộ file, frontmatter `phase`, `dependencies`, và H1
  - Mọi lệnh trong plan đổi `vc <cmd>` → `av <cmd>`, `vc:` → `av:`
  - Bảng ánh xạ rebrand ở phase 9 và 11 sửa từ `VCSKILL_*` sang `ARIADNEV_*`
  - Bảng định danh phase 2 khôi phục cột "Cũ" sau khi bị sed ghi nhầm
  - Phase 8: bỏ nhánh grandfather, thay bằng tự verify; success criteria viết lại
  - Phase 1: bước 2 chuyển từ "hỏi người dùng" sang quyết định đã chốt
  - Phase 12: thêm mục quyết định skill `git`
  - Đồ thị phụ thuộc kiểm lại: không có chu trình
- Unresolved contradictions: 0

## Audit vòng 2 — 2026-08-14

Báo cáo: `plans/reports/audit-260814-2046-plan-round2.md`
Phạm vi: phase 2 và 8 (viết sau red-team vòng 1, chưa từng review) + audit độ phủ toàn plan.
12 red-team finding + 18 gap độ phủ. Mọi số liệu đã verify độc lập.

### Số liệu sai đã sửa

| Hạng mục | Plan cũ ghi | Thực tế |
|---|---|---|
| Hook top-level | 22 | **17** (15 `.cjs` + 2 `.sh`) |
| Module `_lib` | 34 | **28** |
| Symlink trong nguồn | 14 | **0** trong `ak-*` |
| File cần đổi tên | 130 | **205** (+ ~1700 occurrence `vc:`) |

Ngoài ra: ~28 tham chiếu "phase N" trong thân bài còn dùng số cũ sau lần renumber trước, và
bảng "Áp vào" của Red Team Review cũng vậy — đã sửa hết.

### Quyết định vòng 2

| # | Quyết định | Áp vào |
|---|---|---|
| 8 | State cũ trên máy: **không code migration**, người dùng tự dọn tay | Phase 2 + migration guide ở phase 16 |
| 9 | Artifact adapter: **port đầy đủ**, nhưng **sinh từ receipt** như output phái sinh — receipt vẫn là nguồn sự thật duy nhất, nên không tái lập lỗi hai bản ghi (C2) | Phase 15 (mới) |
| 10 | Statusline: **port đầy đủ, phase riêng** | Phase 14 (mới) |
| 11 | 13 agent distill: **thay hết bằng bản nguồn**, đổi tên theo nguồn | Phase 12 |
| 12 | `output-styles`: **thêm artifact kind `outputStyle`** | Phase 3 |
| 13 | Version: **nhảy `1.0.0`** | Phase 2 |
| 14 | `bavanchun/vcskill-web` → **`ariadnev-web`** (người dùng đổi trên GitHub, plan sửa schema) | Phase 2 |

### Gap đã nhận chủ

`hooks.json` (8 event / 21 binding, thứ tự + args) → phase 9. Hai hook `.sh` → phase 9.
`notifications/lib/env-loader.cjs` + docs → phase 9. `ck-config.schema.json` nguồn → phase 10
bước 0. `kit/commands/` → phase 3. Docs nội dung + changeset + e2e → phase 16.

### Whole-Plan Consistency Sweep — sau audit vòng 2
- Files reread: `plan.md` + 16 phase file
- Decision deltas checked: 7 quyết định mới + 4 số liệu sửa
- Reconciled: bảng phase 13→16 dòng; acceptance criteria thêm mục 9-12; bảng rủi ro viết lại
  theo quyết định tự verify; mọi tham chiếu "phase N" và bảng Red Team "Áp vào" shift đúng
- Unresolved contradictions: 0

## Câu hỏi mở

- `delegation-protocol` giữ hay coi là bị `orchestration-protocol` thay thế? Quyết ở
  phase 12 bước 1; kết quả là 9 hoặc 10 rules.
- Skill nặng asset (`ui-styling` 5.8MB) nhúng hết hay tách sidecar? Quyết ở phase 4 theo số đo.
- Hosting cho `ariadnev.com` dựng khi nào? Ngoài scope plan này, nhưng phase 2 bước 8 cần
  `ARIADNEV_BASE_URL` trỏ local để test.

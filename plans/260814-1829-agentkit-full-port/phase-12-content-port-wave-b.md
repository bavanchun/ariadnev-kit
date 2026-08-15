---
phase: 12
title: "Port nội dung wave B — 76 skill + agents + rules"
status: completed
priority: P2
effort: "12d"
dependencies: [11, 13]
---

# Phase 12: Port nội dung wave B

## Overview

76 skill còn lại với ~101 cạnh phụ thuộc, 3 agent và các rules còn thiếu. Hai skill khổng
lồ (`cti-expert` 177 file, `document-skills` 131 file — cộng lại lớn hơn toàn bộ kit hiện
tại) có acceptance riêng.

Effort tăng 8d → 12d: bản trước định giá 76 skill khó bằng 5d cho 27 skill dễ, tức 9.5
skill/ngày cho phần mang mọi ca khó — ngược với thực tế.

`dependencies: [10, 12]` chứ không chỉ `[10]`: 7 skill phụ thuộc binary `ak` cần lệnh `vc`
tương ứng từ phase 13. Bản plan trước đặt chúng ở giữa wave B và tạo chu trình không khai báo.

## Requirements

Functional:
- Port 76 skill giữ nguyên cấu trúc và nội dung, chỉ đổi định danh như wave A.
- Cross-reference resolve đúng sau khi đổi tên.
- **Thay toàn bộ 16 agent bằng bản nguồn** (quyết định 2026-08-14, nhất quán với skill và
  rules): 13 agent distill bị ghi đè, 3 agent thiếu được thêm. Tên đổi theo nguồn —
  `av-developer` → `fullstack-developer`, `av-reviewer` → `code-reviewer`,
  `av-simplifier` → `code-simplifier`. Mọi tham chiếu tới tên cũ trong skill phải cập nhật.
- Port rules theo bảng before/after bên dưới.
- 7 skill phụ thuộc `ak` (`ak`, `cook`, `bootstrap`, `fix`, `journal`, `plans-kanban`,
  `show-off`) viết lại phần gọi CLI sang lệnh `av` của phase 13.
- Cổng `av audit scripts` như wave A, gồm cả `cti-expert/scripts/install.sh`.

Non-functional:
- Validate sau mỗi lô ~15 skill.
- `cti-expert` và `document-skills` có acceptance độc lập, không gộp vào lô.

## Bảng rules before/after

Nguồn có 8 rules; kit hiện có 3; chỉ `development-rules` trùng tên. Bản plan trước ghi
"5 rules còn thiếu" rồi liệt kê 6, và bỏ sót `orchestration-protocol` — số học không khớp
với acceptance criterion.

| Rule | Nguồn | Kit hiện tại | Quyết định |
|---|---|---|---|
| development-rules | ✓ | ✓ | Thay bằng bản nguồn |
| primary-workflow | ✓ | — | Port |
| skill-workflow-routing | ✓ | — | Port (rewrite ref `ak:`) |
| skill-domain-routing | ✓ | — | Port |
| orchestration-protocol | ✓ | — | Port (rewrite ref `ak:`) |
| documentation-management | ✓ | — | Port |
| review-audit-self-decision | ✓ | — | Port |
| process-management | ✓ | — | Port |
| delegation-protocol | — | ✓ | **Quyết ở bước 1**: giữ hay coi là bị `orchestration-protocol` thay thế |
| intake-and-context | — | ✓ | Giữ (không có bản nguồn tương đương) |

Kết quả: 9 hoặc 10 rules tuỳ quyết định về `delegation-protocol`. Con số cuối cùng chốt ở
bước 1 và cập nhật ngược vào `plan.md` acceptance criterion 1.

## Skill `git`

**Quyết định (2026-08-14): thay bằng bản nguồn.** `av:git` là bản port từ nguồn, không giữ
bản fork `ck:git`. Mọi dấu vết `ck:`/`forked-from` phải biến mất (phase 1 bước 8 đã gỡ
metadata; phase này ghi đè nội dung). Tổng: 103 skill đều từ nguồn.

Hệ quả: mất các tuỳ biến riêng của bản fork (co-author footer, prc pipeline). Nếu sau này
muốn lại, lấy từ tag `pre-agentkit-port` tạo ở phase 1.

## Related Code Files

- Create: `kit/skills/<name>/**` — 76 cây skill
- Overwrite: `kit/agents/*.md` — cả 16 agent từ nguồn (13 thay + 3 mới)
- Create/Modify: `kit/rules/*.md` theo bảng trên
- Modify: `packages/cli/src/kit/skill-crossrefs.ts` — kiểm cross-ref toàn kit

## Implementation Steps

1. Chốt `delegation-protocol` giữ hay bỏ; cập nhật số rules vào `plan.md`.
2. Dựng đồ thị phụ thuộc từ nguồn, xuất thứ tự topo. Phát hiện chu trình (`handoff` ↔
   `handover` là cặp nghi ngờ) → port cả cụm cùng lô.
3. Port theo thứ tự topo, lô ~15 skill, `av validate` + `av audit scripts` sau mỗi lô.
4. `document-skills` riêng: xác nhận sub-skill lồng hoạt động đầu-cuối (4 sub-skill có
   `SKILL.md` riêng), và chạy được dù nguồn không có khai báo dependency (phase 7 đã sinh).
5. `cti-expert` riêng: 11 thư mục con, 7 script Python, và `install.sh` đặc quyền — finding
   của cổng script phải xử lý bằng văn bản, không chấp nhận một dòng.
6. Thay 16 agent bằng bản nguồn; đổi tên 3 agent lệch tên; cập nhật mọi tham chiếu tên agent
   trong skill và rules; port rules theo bảng; rewrite mọi tham chiếu `ak:`.
7. Port 7 skill phụ thuộc binary, đổi sang lệnh `av` của phase 13.
8. `skill-crossrefs` toàn kit; sửa mọi ref gãy.

## Success Criteria

- [x] `av validate` báo **103 skills** (101 port + 2 của repo), **16 agents** đều từ nguồn,
      **10 rules**, 0 error
- [x] Không agent nào còn là bản distill; tên khớp nguồn
- [x] 0 reference gãy — `skills-pending-port.json` đã rỗng, không còn ô trống nào
- [x] `document-skills` giữ đủ 4 sub-skill lồng (`pdf`, `xlsx`, `docx`, `pptx`)
- [x] `cti-expert` giữ 12 thư mục con của nguồn; `install.sh` có bảng quyết định bên dưới
- [ ] **Chưa đạt**: 7 skill từng phụ thuộc `ak` đổi tên lệnh sang `av`, nhưng **69 tham
      chiếu trỏ tới lệnh chưa tồn tại** — xem "Khoảng trống CLI"
- [x] Grep `ak:`, `AgentKit`, `AGENTKIT_` toàn kit trả 0 (cổng CI, không phải grep tay)
- [x] `av audit` xanh sau khi cài đủ kit — **1514 file ok, 0 drift**
- [x] `pnpm test` xanh (983 test)

## Risk Assessment

**Đồ thị có chu trình.** Tín hiệu: bước 2 phát hiện vòng. Phản ứng: port cả cụm cùng lô rồi
validate một lần, không ép thứ tự.

**Khối lượng làm lỗi lọt qua vì mệt.** Tín hiệu: validate xanh nhưng skill dùng thực tế sai.
Phản ứng: validate sau mỗi lô 15; `av audit` là lưới thứ hai; hai skill khổng lồ tách riêng
để không trôi trong lô lớn.

**7 skill phụ thuộc binary vẫn kẹt nếu phase 13 trượt.** Tín hiệu: phase 13 chưa xong khi
tới bước 7. Phản ứng: `dependencies: [10, 12]` khiến điều này không xảy ra theo lịch — nếu
vẫn xảy ra thì dừng bước 7, không port ở trạng thái "tài liệu chạy được nhưng runtime hỏng"
như bản plan trước cho phép.


## Quyết định cổng script — `cti-expert/scripts/install.sh`

Script này cài ~20 công cụ OSINT. Nó **không tự chạy**: README hướng dẫn gọi tay
(`bash .../install.sh`) với cờ `--headless` / `--go` / `--all`, và không skill nào gọi nó.

| Finding | Dòng | Quyết định | Lý do |
|---|---|---|---|
| `writes-outside-skill` — mặc định cài binary vào `/usr/local/bin` | 131 | **Sửa** | Đổi mặc định sang `$HOME/.local/bin` và chỉ dùng `sudo` khi đích thật sự không ghi được. Đường đi thường gặp nay không cần root, không mất chức năng: caller vẫn truyền được đích hệ thống |
| `privilege-escalation` — `sudo apt-get install` (3 chỗ) | 67, 105, 198 | **Chấp nhận** | Đây chính là việc script được gọi để làm: cài gói hệ thống (`whois`, `dig`, `exiftool`, `libcairo2-dev` cho maigret). Không có cách cài gói apt mà không cần root. Người dùng gọi tay, có cờ, README ghi rõ nó cài gì |
| `remote-code-execution` — `curl -sL "$url" \| tar -xz` | 151 | **Chấp nhận** | Tải release binary từ GitHub. URL không phải hằng số tuỳ tiện: lấy qua `gh api repos/$repo/releases/latest`, tức chỉ từ release chính thức của repo được khai trong script. Giải nén vào `mktemp -d`, không phải vào cây skill |
| `remote-package-install` — `go install`, `brew install`, `apt-get` | 73, 122, 67/105/198 | **Chấp nhận** | Cùng lý do: đây là trình cài công cụ, và tất cả đều là gói được đặt tên tường minh trong script, không phải tên lấy từ input |

Không chấp nhận bằng một dòng: mỗi ô trên nói script làm gì và vì sao cần.

**Sửa thêm một lỗi thật** (không phải finding của cổng, phát hiện khi đọc):
`generate-cti-docx-hybrid.py` chạy `subprocess.run(["command","-v","pandoc"], shell=True)`,
**không kiểm tra gì cả** — với `shell=True` thì phần sau phần tử đầu trở thành đối số của
shell, nên nó chạy `command` trần và luôn thành công. Và khi thất bại thì nó chạy
`apt install -y pandoc`, cài gói hệ thống không hỏi, từ một script sinh tài liệu. Thay bằng
`shutil.which` + thông báo hướng dẫn.

## Khoảng trống CLI — chưa lấp

Đếm chính xác trên nội dung đã port: **69 tham chiếu tới lệnh `av` không tồn tại**.

| Nhóm | Số tham chiếu | Ví dụ |
|---|---|---|
| `av journal *` | 17 | `av journal create`, `av journal list` |
| `av plan <mutation>` | ~30 | `update` (11), `resolve` (9), `close` (6), `reindex` (3), `status`, `check`, `archive`, `cleanup`, `publish` |
| `av config start\|stop\|status` | 7 | quản lý tiến trình nền của bản nguồn |
| khác | 15 | `av ship`, `av codex-agent-runtime` (Tier-3, đã ở non-goals) |

Phase 13 dựng `plan {use, show}` — đúng scope plan đề ra, nhưng scope đó nhỏ hơn nhu cầu
thật. **Quyết định thuộc về người dùng** (dựng nốt CLI plan/journal, hay chấp nhận skill
tham chiếu lệnh không có). Không dựng stub: một lệnh có mặt mà không làm gì báo thành công,
lệnh vắng mặt báo lỗi ngay.

## Kết quả (2026-08-15)

### Ba thứ trong `~/.claude/skills` không phải của AgentKit

Cùng phương pháp đã dùng cho hook: đối chiếu manifest hash của chính AgentKit, mtime và
quyền file.

| Thứ | Bằng chứng | Xử lý |
|---|---|---|
| `ak-plan-i18n` (13 file) | Không có file nào trong manifest; mtime 14/08 16:52 (AgentKit cài lúc 08:31); mode 0644 vs 0600 | **Không port** — bản fork riêng của người dùng từ `ak-plan`, thêm HTML song ngữ |
| `cti-expert/vendor/sharetrace` (64 file) | Không có trong manifest; mtime 24/07, ba tuần trước khi cài AgentKit | **Không port** — cây vendor của người dùng |
| `ak-ak` (188 dòng) | Là của AgentKit, nhưng **toàn bộ nội dung là hướng dẫn dùng CLI `ak`**: init, recover, login, self-update — đều nằm trong non-goals | **Không port** — port nó là ship một cuốn manual cho lệnh không tồn tại |

`ak-agentkit` thì ngược lại: nội dung là **task router**, không phụ thuộc sản phẩm. Port với
tên thư mục `ariadnev` cho khớp `name: av:ariadnev` sau khi rewrite.

Tổng: 101 skill port + 2 của repo (`pm`, `obsidian-second-brain-note`) = **103**.

### Bảng thay thế phải mở rộng bốn lần, mỗi lần do một ca thật

1. `CLAUDEKIT4e46…` và `claudekitMatch` — thương hiệu **dính liền** ký tự khác, luật neo
   biên bỏ sót. Tên sản phẩm không bao giờ là gì khác ngoài thương hiệu → bỏ neo biên cho
   riêng nó (khác với alias hai ký tự, vẫn phải neo).
2. `/ak:<slug>`, `ak:*` — dạng placeholder trong tài liệu.
3. `ck:CI` — chữ hoa sau dấu hai chấm.
4. `ak --version`, `` process.env.CLI || 'ak' `` — alias trần đứng một mình. Cuối cùng luật
   rewrite được chỉnh **trùng khít** luật dò residue, nên thứ gì sót lại là lỗi của luật,
   không phải một phán đoán làm hai lần.

### Lint của kit và corpus nguồn, vòng hai (agent)

Đo trên 16 agent nguồn: 7 không có `<example>`, 8 không có `Behavioral Checklist`, 9 vượt
120 dòng, 1 lệch tên/file. Cùng cách xử như skill, nhưng **không cần field mới**: tiền tố
`av-` vốn đã là dấu hiệu — agent mình viết có, agent port giữ tên nguồn.

Hai sửa là sửa **luật sai**, không phải miễn trừ: `fable` và `inherit` là giá trị model có
thật (agent `kongming` pin `fable`), danh sách hợp lệ chỉ đơn giản viết trước khi chúng tồn
tại.

### Ba lỗ nữa trong cổng kiểm, lộ ra nhờ nội dung thật

1. **Trình quét script không biết chuỗi nhiều dòng.** Một Dockerfile dán trong test fixture
   Python bị đọc thành script chạy `apt-get install`. Nay theo dõi `"""`/`'''`/backtick
   xuyên dòng.
2. **Không có luật cho package manager hệ thống.** `apt install` trần (không sudo) không bị
   bắt — nhưng script cố cài gói vẫn là script sửa máy người dùng.
3. **Guard "không nhúng token" bắt một placeholder** (`ghp_xxxxxxxxxxxxxxxxxxxx` trong tài
   liệu). Đổi placeholder thay vì thêm ngoại lệ: một guard có danh sách miễn trừ là guard
   sẽ bị bào mòn.

Thêm một dương tính giả ở cổng khác: check "không rò đường dẫn tuyệt đối" của docs bundle
bắt `/goal` — một **slash command**, không phải đường dẫn. Nay đòi ít nhất hai đoạn đường
dẫn, đúng hình dạng của thứ nó thật sự cần chặn (`/Users/<ai đó>/...`).

### Đo được

- Binary **82MB** (ngưỡng 120MB) — sidecar của phase 4 **không cần kích hoạt**, đúng như
  ước tính ở phase 11.
- Cài đủ kit: **1514 file, 0 drift**; font `.ttf` byte-identical trên provider tree.
- `av audit scripts`: **228 script** quét, **1** file flagged (chính là `install.sh` ở trên).

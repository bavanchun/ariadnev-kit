---
phase: 8
title: "Bằng chứng provider + whitelist event"
status: completed
completed: 2026-08-15
priority: P1
effort: "7d"
dependencies: [2, 7]
---

# Phase 8: Bằng chứng provider + whitelist event

## Overview

Bản plan trước định xây matcher translation. Đó là code không có consumer: hook chỉ cài
được cho claude-code, mọi provider khác bị skip **trước** khi matcher được xét, và
claude-code là identity nên không dịch gì. Bề mặt thật sự đang nhận dữ liệu sai là **event
name** — loader chấp nhận bất kỳ chuỗi nào, còn nguồn bind 22 event mà vcskill chưa từng
validate.

Đồng thời: bằng chứng verify của các ô hiện có trỏ vào hai file không tồn tại trong repo.

## Requirements

Functional:
- Mỗi ô `(provider, artifact)` verified mang `evidence`: nguồn, ngày, cách kiểm.
- Whitelist event name trong `load-kit.ts`, đối chiếu vocabulary Claude Code thật.
- Ô `scripts` phải **tự verify lại**, không kế thừa: nó đang `true` cho mọi provider kể cả
  `antigravity` (agent/command = false), nhưng nó được verify cho `kit/scripts/` dùng
  chung, không phải cho script thực thi per-skill mà phase 7 giới thiệu.
- `test-provider` loại khỏi yêu cầu bằng chứng — nó là mock nội bộ, `index.ts:16` đã lọc
  khỏi danh sách công khai.

Non-functional:
- Provider **quan sát được** thì ô phải phản ánh quan sát, kể cả khi kết quả là hạ cấp.
  Xem "Provider dự kiến kết thúc unverified" — đây là regression **đã được chấp nhận trước**,
  không phải bất ngờ lúc chạy.
- `src/adapt/` giữ pure.

## Architecture

**Vấn đề bằng chứng.** `spec-verified.ts:3-4` trích `scripts/codex_generator*.py` và
`scripts/generate-opencode.py` làm nguồn verify. Cả hai không tồn tại trong repo (đã tìm).
`~/.agentkit/adapters/` chỉ chứa output đã sinh, không có generator.

**Quyết định (2026-08-14): tự verify lại từ đầu, không grandfather.** Không dựa vào
generator đã thất lạc. Với mỗi provider, cài thật và quan sát hành vi thực tế: đường dẫn
nào được đọc, format frontmatter nào được chấp nhận, tool name nào được hiểu. Bằng chứng là
quan sát có ngày trên phiên bản provider cụ thể, không phải trích dẫn file của người khác.

Đây là lý do effort 3d → 7d. Đổi lại: bảng verified phản ánh sự thật kiểm chứng được, và
mỗi ô ghi rõ verify trên phiên bản provider nào — thứ mà bản trích dẫn generator không có.

### Phân loại provider theo khả năng quan sát

| Provider | Quan sát được? | Cách verify | Dự kiến |
|---|---|---|---|
| `claude-code` | Có (đang cài) | Cài kit, kiểm file đọc thật, chạy skill/hook | Giữ verified đủ |
| `codex` | Có, nếu cài được CLI | Như trên | Verified phần cài được |
| `cursor` | Có, nếu cài được app | Như trên | Verified phần cài được |
| `opencode` | Cần cài mới | Như trên | Chưa rõ |
| `antigravity` | **Không có trên máy này** | — | **Hạ về `unverified`** |
| `generic` | **Không phải sản phẩm** — layout `.agents/` trung tính, không có consumer | Không quan sát được theo định nghĩa | **Lớp riêng: "verified by convention"**, ghi rõ là quy ước chứ không phải quan sát |
| `test-provider` | Mock nội bộ, `index.ts:16` lọc khỏi danh sách công khai | Không áp yêu cầu bằng chứng | Giữ nguyên |

**Regression đã chấp nhận trước:** `antigravity` sẽ chuyển sang `unverified` → `av install
--provider antigravity` ghi 0 file và log skip. Đây là hệ quả trực tiếp của việc không đoán
đường dẫn, và được chấp nhận thay vì giữ ô `true` không có bằng chứng.

### "Quan sát" nghĩa là gì, theo từng artifact kind

Không có provider nào phát log "tôi đã đọc file này", nên phải định nghĩa bằng chứng gián
tiếp, quyết ở bước 1 và ghi vào ADR:

| Kind | Bằng chứng chấp nhận được |
|---|---|
| `skill` | Provider liệt kê skill theo tên trong UI/CLI của nó sau khi cài |
| `agent` | Provider liệt kê agent, hoặc gọi được agent theo tên |
| `command` | Gõ lệnh trong provider ra đúng nội dung đã cài |
| `rules` | Nội dung rules xuất hiện trong context provider gửi đi (kiểm bằng prompt thăm dò) |
| `hook` | Hook chạy thật, quan sát bằng side effect (ghi file mốc) |
| `scripts`, `env` | File tồn tại đúng chỗ và provider chạy được script từ đó |

Kind nào không dựng được bằng chứng cho một provider thì ô đó `unverified`.

**Event whitelist.** `load-kit.ts:140-146` nhận bất kỳ chuỗi non-empty nào làm event. Nguồn
bind các event như `Elicitation`, `PermissionDenied`, `TeammateIdle`, `PostToolUseFailure`,
`ConfigChange` — kit chưa từng cài hay validate. Whitelist bắt được hook nguồn bind vào
event mà provider đích không hiểu, ngay lúc validate thay vì im lặng lúc chạy.

**Cảnh báo:** whitelist soạn thuần từ tài liệu Claude Code sẽ **reject chính hook kit đang
ship**. `kit/hooks/subagent-init/hook.json:2` bind `SubagentStart`, không nằm trong tập
event tài liệu hoá (tài liệu có `SubagentStop`, không có `SubagentStart`). Vì vậy whitelist
phải là **hợp** của: tập tài liệu hoá ∪ mọi event mà 6 hook hiện có đang bind
(`PreToolUse`, `UserPromptSubmit`, `SessionStart`, `Stop`, `SubagentStop`, `SubagentStart`),
mỗi mục ngoài tài liệu kèm ghi chú lý do giữ.

**Không làm:** `matcher-translate.ts`, cột `matchers`, `adapt-decision-log.ts`. Skip lý do
đã lưu trong `ReceiptSkip {kind,name,reason}` (`install-receipt.ts:25-29`), và
`history/store.ts` + `av query` đã là bề mặt log có sẵn — không dựng cái thứ ba.

## Related Code Files

- Modify: `packages/cli/src/providers/spec-verified.ts` — `evidence` mỗi ô; re-derive `scripts`
- Modify: `packages/cli/src/kit/load-kit.ts` — whitelist event
- Create: `packages/cli/src/kit/hook-events.ts` — vocabulary event + test
- Create: `docs/decisions/0006-provider-verification-evidence.md` — ADR
- Create: `packages/cli/reference/` — nơi vendor generator nếu phục hồi được

## Implementation Steps

1. Với mỗi provider trong 6 cái: cài provider thật (hoặc dựng môi trường tối thiểu), ghi
   lại phiên bản, rồi cài kit vào và quan sát — đường dẫn nào được đọc thật, format nào
   được chấp nhận, tool name nào được hiểu. Ghi thành `evidence` kèm ngày + phiên bản.
2. Provider nào không cài được trên máy này: ghi rõ "không verify được, thiếu môi trường"
   và hạ ô về `unverified`. Không suy đoán từ tài liệu.
3. Thêm `evidence` cho từng ô. Ô verified phải trỏ vào quan sát thật ở bước 1, không trỏ
   vào tài liệu hay generator của bên thứ ba.
4. Re-derive ô `scripts` cho từng provider dưới ngữ nghĩa mới (script thực thi per-skill),
   không kế thừa giá trị cũ.
5. `hook-events.ts`: whitelist = tập tài liệu hoá ∪ event của 6 hook hiện có. Viết test đỏ
   **trước**: cả 6 hook đang ship phải validate sạch, đặc biệt `SubagentStart`.
6. `load-kit.ts` reject event ngoài whitelist. Test hai chiều: hook bind `Elicitation` →
   lỗi rõ; hook bind `SubagentStart` → qua.
7. Viết ADR 0006 ghi cách verify từng provider và mức độ tin cậy của từng ô.

## Success Criteria

- [x] Mọi ô `observed` ghi **lệnh đã chạy + thấy gì**, kèm ngày và phiên bản provider
- [x] Không ô nào còn trích dẫn generator bên thứ ba (có test chặn 3 chuỗi đó)
- [x] Provider không quan sát được ghi rõ lý do; ô riêng của nó hạ về `unverified`
- [x] Ô `scripts` re-derive: `convention` ở mọi provider, không kế thừa
- [x] `test-provider` loại khỏi `EVIDENCE_REQUIRED_PROVIDERS`
- [x] 6 hook hiện có validate sạch, gồm `SubagentStart` (test chiều chấp nhận, load kit thật)
- [x] Event ngoài whitelist → lỗi nêu tên hook, tên event, tập hợp lệ và **hậu quả**
- [x] `antigravity` ghi rõ không có CLI để quan sát; `generic` toàn bộ là `convention`
- [x] Không tồn tại `matcher-translate.ts` hay `adapt-decision-log.ts`
- [x] ADR 0006 ghi cách quan sát từng provider + phiên bản, hoặc lý do không quan sát được
- [x] `src/adapt/` vẫn pure, coverage **99.28%**
- [x] `pnpm test` xanh — 854 test

## Kết quả thực thi (2026-08-15)

### Quan sát được nhiều hơn dự đoán của plan

Plan dự đoán `antigravity` không có trên máy và `cursor` quan sát được. Thực tế ngược lại một
phần: `/Applications/Antigravity.app` **có** nhưng không ship CLI nào; còn `cursor-agent` có
CLI nhưng **không có bề mặt liệt kê cục bộ** nào.

Ba provider quan sát được thật, và bằng chứng mạnh hơn "file nằm đúng chỗ":

| Provider | Phiên bản | Lệnh quan sát | Thấy gì |
|---|---|---|---|
| claude-code | 2.1.232 | phiên đang chạy | skill/agent/command liệt kê theo tên; hook chạy thật |
| codex | codex-cli 0.147.0 | `codex debug prompt-input` | **prompt codex thật sự gửi**: 25 skill theo tên, thư mục cài là skill root, 13 agent, khối AGENTS.md |
| opencode | 1.15.3 | `opencode debug skill` / `agent list` / `debug config` | 26 skill kèm **location** đúng thư mục installer ghi; 13 agent; command trong config đã resolve |

`codex debug prompt-input` là bằng chứng tốt nhất tìm được: nó render prompt model nhìn thấy,
nên không phải suy đoán codex *có thể* đọc gì mà là codex **đã gửi** gì. Agent được kiểm với
codex cài **một mình** — nếu không, `.agents/skills/av-*` do cursor ghi có thể giải thích
nhầm cho các tên đó.

### Ba mức bằng chứng, vì gộp lại là tự ký nhận

`observed` (đã chạy provider và thấy nó nạp) / `convention` (không quan sát riêng, nhưng dùng
đúng layout trung tính **đã** quan sát chạy được ở provider khác) / `none` (không có gì → ô
false, installer skip).

### Ô mất bằng chứng — hạ cấp có chủ ý

`codex.command`, `cursor.command`, `cursor.rules`, `opencode.rules`. Cụ thể:
`.codex/commands/term-config.md` **được ghi** nhưng không bao giờ xuất hiện trong
prompt-input; `opencode debug config` báo `instructions` rỗng. Người dùng các provider đó sẽ
ngừng nhận file mà chưa ai từng quan sát thấy được đọc. Ma trận README đã cập nhật theo.

### Verify lại làm lộ một lỗi thật

`planRules` **chưa bao giờ** kiểm `supports.rules`; nó khẳng định non-null bằng `!`. Nhánh đó
không thể chạm tới chừng nào mọi provider còn `rules: true`. Ngay khi một provider mất bằng
chứng, `null` chạy thẳng tới path guard và **crash** thay vì skip.

Đúng như Risk Assessment dự đoán — nhưng lỗi nằm ở chỗ khác dự đoán: không phải đường dẫn
sai, mà là **cái gate chưa bao giờ được thực thi thì không phải là gate**.

### Whitelist event

Hợp của tập tài liệu hoá và event 6 hook đang ship. `SubagentStart` giữ lại kèm ghi chú lý do
— test chiều chấp nhận **load kit thật** rồi đối chiếu, nên whitelist soạn từ tài liệu thuần
sẽ đỏ ngay. Thông báo lỗi nêu cả hậu quả ("never fires"), vì đó mới là thứ khiến người đọc
hiểu tại sao phải sửa.

## Risk Assessment

**Tự verify làm lộ ra provider đang `true` nhưng thực tế sai.** Tín hiệu: bước 1 quan sát
thấy đường dẫn thật khác với `resolver.ts`. Phản ứng: sửa đường dẫn theo quan sát — đó
chính là giá trị của việc verify lại, và nó có thể là breaking change với bản cài cũ. Ghi
rõ trong ADR và trong changeset.

**Không dựng được môi trường cho antigravity hoặc opencode.** Tín hiệu: không cài nổi
provider trên máy này. Phản ứng: hạ ô về `unverified` kèm lý do — installer sẽ skip + log,
đúng quy tắc "không đoán đường dẫn". Chấp nhận bảng có ô trống hơn là bảng đẹp mà sai.

**Whitelist event chặn nhầm hook hợp lệ.** Tín hiệu: `av validate` đỏ trên kit chưa đụng
tới. Phản ứng: test chiều chấp nhận ở bước 5 bắt được ngay; whitelist là danh sách sống,
thiếu thì bổ sung kèm ghi chú.

**Định nghĩa "quan sát" quá lỏng thành ra tự ký nhận.** Tín hiệu: evidence ghi kiểu "đã cài,
trông có vẻ chạy". Phản ứng: bảng bằng chứng theo kind ở trên là bắt buộc — mỗi ô phải nêu
được side effect quan sát được, không phải cảm nhận.

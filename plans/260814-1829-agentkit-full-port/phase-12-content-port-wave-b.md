---
phase: 12
title: "Port nội dung wave B — 76 skill + agents + rules"
status: pending
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

- [ ] `av validate` báo 103 skills, 16 agents (đều từ nguồn), số rules theo bảng, all passed
- [ ] Không agent nào còn là bản distill; tên khớp nguồn
- [ ] `skill-crossrefs` báo 0 reference gãy
- [ ] `document-skills` cài ra đủ 4 sub-skill và script chạy được
- [ ] `cti-expert` giữ đủ 11 thư mục con; `install.sh` có quyết định bằng văn bản
- [ ] 7 skill từng phụ thuộc `ak` chạy được bằng lệnh `vc` — kiểm bằng chạy thật, không
      chỉ bằng validate
- [ ] Grep `ak:`, `AgentKit`, `AGENTKIT_` toàn kit trả 0
- [ ] `av audit` xanh sau khi cài đủ kit
- [ ] `pnpm test` xanh

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

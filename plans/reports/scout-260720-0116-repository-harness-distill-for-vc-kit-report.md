# Scout: repository-harness — chưng cất gì cho vc kit v2

Scouted: `/Users/vchun/Documents/kit/repository-harness` (Rust harness-cli + docs framework) | 2026-07-20
Đọc kỹ: HARNESS.md (446d), FEATURE_INTAKE.md, CONTEXT_RULES.md, TEST_MATRIX.md, AGENTS.md shim, templates/, stories/ structure.

## Repo là gì

"Repository-level operating harness": làm repo đích trở nên agent-ready. Trục khác CK — CK ship tooling cho agent; repo này ship **quy trình + hợp đồng làm việc** (docs-as-contract) + durable layer SQLite (harness-cli Rust). Câu thần chú: *"The app is what users touch. The harness is what agents touch."*

## Ý tưởng đáng chưng cất (xếp theo giá trị cho vc)

1. **Risk lanes + flag checklist + hard gates** (FEATURE_INTAKE): mọi change request được phân lane tiny/normal/high-risk bằng đếm risk flags (auth, data model, public contracts, weak proof, multi-domain…: 0-1 → tiny/normal; 2-3 → normal+validation mạnh; 4+ hoặc hard gate → high-risk). Máy phân loại, không phải người. → **vc:cook intake routing** — CK không có cái này, điểm vượt rõ.
2. **Request-class authority gate** (CONTEXT_RULES + AGENTS.md): read-only requests (answer/explain/review/plan/status) KHÔNG được mutate gì; chỉ change/build/fix mới có quyền ghi. "Review and apply fixes" = change vì user xin sửa. → nạp vào `kit/rules/` — khớp sẵn ranh giới vc:ask (read-only) vs vc:cook.
3. **Context read-matrix theo phase × lane + token budget** (CONTEXT_RULES): bảng Must/Should/Skip cho từng phase (intake/planning/implementation/validation/trace), budget ~2K/5K/10K tokens theo lane, retrieval triggers, bounded retrieval ("stop after the answer is supported"). → chưng cất thành quy tắc đọc trong rules + vc:cook.
4. **Proof vocabulary** (TEST_MATRIX): unit/integration/e2e/platform + status planned/in_progress/implemented/changed/retired; "không mark implemented khi chưa có proof"; story được phép thiếu cột proof nếu giải thích. → nâng test-gate của vc:cook + evidence rules của vc:pm.
5. **Trace phase** (TRACE_SPEC): cuối mỗi change ghi files-read/files-changed/outcome/friction cho agent kế tiếp. → session-state hook của vc đã có nền; enrich thêm git-status + outcome.
6. **Harness delta + friction backlog** (IMPROVEMENT_PROTOCOL): mỗi change có thể sinh 2 output — product delta + harness delta (docs/template/rule cải thiện); friction lặp → backlog item. → quy tắc nhỏ trong rules; vc:journal ghi friction.
7. **Decision records** `docs/decisions/NNNN-*.md` + template: quyết định durable tách khỏi chat history. → thêm mode `decision` cho vc:docs.

## Không lấy (v2)

- **SQLite durable layer + Rust CLI**: đúng hướng nhưng nặng; durable layer của vc = markdown + frontmatter (plans/, session-states) — đủ cho solo dev, YAGNI. Xem lại ở v3 nếu plan-sync tay lỗi lặp.
- Story packets/epics đầy đủ + maturity scoring + benchmark protocol: thay bằng plans/ hiện có; maturity scoring là để đo harness — chưa cần.
- Installer bash/ps1 + managed AGENTS.md block: vcskill đã có cơ chế tương đương (agents-md managed block).

## Map vào plan v2 (đã propagate)

| Ý | Đích trong plan 1 |
|---|---|
| Authority gate + risk lanes + context budget | `kit/rules/` thêm file thứ 3 `intake-and-context.md` (phase 1) |
| Lane routing tiny/normal/high-risk | `vc:cook` thêm `references/risk-lanes.md` + bảng routing trong SKILL.md (phase 6 wave 2 chỉnh cook — hoặc phase 1 nếu gọn) |
| Proof vocabulary | test-gate của cook + sync-back của pm cập nhật (phase 4 rewire) |
| Trace enrich | session-state hook thêm files-changed/outcome (phase 1, TDD) |
| Decision records | vc:docs thêm mode `decision` + template (phase 5 wave 1 đụng docs? — docs skill đã ship v1: chỉnh trong phase 4 rewire) |

## Unresolved questions

1. Risk-lane hard gates của họ (auth/data-loss/external providers) có nên auto-stop vc:cook chờ user confirm không, hay chỉ nâng validation? (đề xuất: high-risk lane → bắt buộc AskUserQuestion trước implement — khớp HARD-GATE hiện có của cook)
2. Trace ghi vào session-state (ephemeral 7d TTL) hay plans/reports (durable)? (đề xuất: session-state cho auto-trace, durable chỉ khi có plan đang chạy)

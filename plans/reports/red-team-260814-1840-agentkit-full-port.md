# Red Team — AgentKit full-port plan

Date: 2026-08-14 · Plan: `plans/260814-1829-agentkit-full-port/`
Reviewers: 4 (Security Adversary, Failure Mode Analyst, Assumption Destroyer, Scope & Complexity Critic)
Verification tier: Full (10 phases) · Raw findings: 37 → deduped: 23 → presented: 15 + 8 secondary
Evidence filter: 0 rejected (every finding carried `file:line` citations)

## Verdict

Plan cần **làm lại phần lớn**, không phải vá. Phase 1, 2, 4, 5 và 8 đều có tiền đề sai
hoặc tiêu chí không thể đạt. Nguyên nhân gốc: khung plan dựng trên scout dừng ở mức module
map, chưa mở `packages/cli/src/install/` — nên bỏ sót rằng receipt đã là ownership record
có hash, và `skillFiles()` đã duyệt cây file tuỳ ý.

## Critical (11)

### C1 — Sửa nhúng nhị phân không cứu được đường ghi ra đĩa
Phase 2 chỉ sửa hop generator → cache. Đường thật còn 3 hop nữa đều cứng `utf8`:
`artifact-content.ts:67` `readFileSync(abs, "utf8")` (decode **trước** khi rẽ nhánh
`isTextFile`), `install-types.ts:8` `content: string`, `fs-atomic.ts:12`
`writeFileSync(tmp, content, "utf8")`. Receipt tính `sha256(op.content)` trên chính chuỗi
đã hỏng (`install-receipt.ts:97`), nên `vc audit` báo `ok`.
Acceptance criterion 5 sẽ **xanh trong khi 56 asset bị phá**.
→ `WriteOp.content: string | Buffer` xuyên suốt; criterion đo file trên provider tree, không đo cache.

### C2 — Phase 4 phát minh lại receipt đã có
`install-receipt.ts:1-2` tự mô tả là "ownership record doctor/uninstall/update all read";
`ReceiptFile { path, sha256 }`; uninstall đã dùng hash-drift làm bảo đảm sở hữu
(`uninstall-plan.ts:55-60`). Ba module mới (`manifest.ts`, `hash-inventory.ts`,
`ownership.ts`) tạo bản ghi song song không có trọng tài khi lệch nhau.
→ Xoá 3 module; thêm `size`/`mtime` vào `ReceiptFile`, `skill_selection` vào
`ReceiptInstall`, viết `audit.ts` như reader thuần trên `Receipt`. Ước lượng 3d → ~1d.

### C3 — Gỡ `vc coverage` phá chính acceptance criterion #1
`validate-command.ts:11,156` **gọi** `runCoverage`. Consumer thật là 11 file, không phải 3
file plan liệt kê (và 3 đường dẫn đó còn sai thư mục). `contract-command.ts:36,54` giữ
`coverage.claims.v1` trong `CAPABILITIES` và `coverage` trong `KNOWN_COMMANDS`, có drift
test canh; gỡ capability mà không bump `PROTOCOL_VERSION` là breaking change im lặng.
→ Tách thành phase riêng **trước** phase 8, kèm danh sách 11 consumer + bump protocol.

### C4 — Phase 8 đỏ ngay từ bước 2, cách sửa nằm ở bước 7
`decisions.test.ts:23-27` khẳng định `decisions.json` phản chiếu **chính xác** inventory
skill. Bước 2 port 3 skill → test đỏ ngay; bước 3-6 chạy trong trạng thái suite đỏ, mất
đúng tín hiệu mà chúng dựa vào.
→ Chuyển việc gỡ ledger/coverage thành bước 0.

### C5 — Crash giữa chừng để lại kit nửa vời không gỡ được
`install-execute.ts:50-69` không có error boundary; receipt ghi một lần sau toàn bộ vòng
lặp (`:112`). Throw ở file thứ 1200/1511 → không receipt, không manifest.
`uninstall-plan.ts:75-76` thấy provider undefined, trả `[]` và **báo thành công trong khi
không xoá gì**. Phase 4 gắn manifest vào đúng điểm ghi muộn đó.
→ Journal ghi ý định *trước* write đầu tiên; tiêu chí "kill ở op N → uninstall xoá đúng N file".

### C6 — Backup gộp 1511 file thành vài chục, rollback là hư cấu
`backup.ts:35` `relPath = join(label, basename(target))`, `:38` `rmSync(dest)` khi trùng,
`:41` manifest filter theo relPath. `install-plan.ts:26` tạo một op mỗi **file** với
`kind: "skill"` → toàn bộ 103 `SKILL.md` dồn về `skill/SKILL.md`, cái sau xoá cái trước.
Bug đã tồn tại hôm nay ở 26 skill; plan nhân blast radius 4x mà không đụng tới.
→ relPath theo dest tương đối scope root; tiêu chí "số entry backup == số file bị ghi đè".

### C7 — Ghi đè 25 skill distill mà không có điểm rollback
`vcskill@0.12.0` == HEAD == `335399f`. Không có tag/branch nào đặt trước khi ghi đè, và
`plans/260814-1717-main-history-rewrite/plan.md:3` vẫn `status: pending` với tag
`destructive, force-push`. Phase 1 bước 8 lại bảo đánh dấu plan destructive **chưa chạy**
đó là `completed`.
*(Bằng chứng gốc của reviewer nói `kit/skills` chỉ có 1 commit — sai, thực tế 21 commit.
Lõi vẫn đúng: không có ref rollback chuyên dụng.)*
→ Tạo và push tag + branch `pre-agentkit-port` trước mọi ghi đè; bỏ lệnh đánh dấu completed.

### C8 — 154 script port nguyên trạng, không qua cổng nào
`vc audit scripts` dựng ở phase 4 nhưng phase 8 (`dependencies: [1,2,3]`) và phase 9
(`dependencies: [8]`) không phụ thuộc phase 4, và không tiêu chí nào yêu cầu review script.
Phase 8 còn cấm sửa nội dung. `ak-cti-expert/scripts/install.sh` chứa `sudo apt-get` (:67,
:105, :191), `go install` (:122), `curl -sL | tar -xz` (:148), `sudo mv` (:151).
→ Thêm `4` vào dependencies phase 8; "audit scripts đã review, mọi finding fixed hoặc
chấp nhận bằng văn bản" thành tiêu chí chặn; cách ly file có `sudo`/`curl|tar`/`go install`.

### C9 — Khai báo dependency không tồn tại ở nguồn; venv chung cài package không pin rồi `verify` import chúng
Phase 3 giả định frontmatter hoặc `skill-env.json`; thực tế nguồn dùng
`scripts/requirements.txt`, và **12/22** skill Python không có khai báo nào
(ai-artist, chrome-profile, context-engineering, copywriting, design, document-skills,
excalidraw, llms, skill-creator, tech-graph, threejs, ui-ux-pro-max). Khai báo có thật thì
dùng range `>=` không pin. `document-skills` import `pypdf, pdf2image, PIL, pptx, openpyxl,
lxml, defusedxml, six` với zero khai báo → `verify` báo `ok` vì hash khai báo rỗng khớp,
script chết runtime. Định nghĩa `corrupt` = "import thử thất bại" nghĩa là `verify` **thực
thi code bên thứ ba** trên venv dùng chung 22 skill.
→ Đọc `requirements*.txt`; tool scan import để tự sinh khai báo cho 12 skill thiếu;
lockfile `--require-hashes`; `verify` chỉ đọc metadata `dist-info`, không import.
Sửa acceptance criterion: 22 skill, không phải 23.

### C10 — Cascade config đảo ngược biện pháp bảo mật repo đã thiết lập
Phase 7 đặt `project > user > default` cho schema chứa `privacyBlock` và `trust.*`, rồi
phase 6 cho hook đọc kết quả đó. `env-scope.ts:3-11` đã ghi rõ quy tắc ngược lại:
"vcskill's own config is owned by the user's shell, never by a project file … This is a
security control, so it fails toward stripping". Clone một repo có `.vc/config.json` đặt
`privacyBlock: false` là tắt được hook chặn `.env`/secrets, im lặng.
→ Tách schema: khoá project-overridable (paths, locale, plan naming) vs khoá user-only
(`privacyBlock`, `trust.*`, `assertions[]`, đích notification). Tầng project phải **không
thể** đặt nhóm thứ hai — reject khi load.

### C11 — Matcher translation là code không consumer; hazard thật nằm ở event name
`spec-verified.ts` đặt `hook: false` cho cả 6 provider ngoài claude-code;
`install-plan.ts:83-85` skip toàn bộ hook **trước** khi bất kỳ matcher nào được xét;
`resolver.ts:184-185` trả `null`. Claude-code là identity nên không dịch gì. Tiêu chí
"matcher `Agent` cài cho codex → bị drop" **không thể được sinh ra bởi hệ thống chạy thật**.
Trong khi đó `load-kit.ts:140-146` nhận **bất kỳ chuỗi nào** làm event, và nguồn bind 22
event lạ (`Elicitation`, `PermissionDenied`, `TeammateIdle`, `PostToolUseFailure`,
`ConfigChange`…) mà vcskill chưa từng cài hay validate.
→ Bỏ matcher translation. Thay bằng whitelist event name trong `load-kit.ts` — đó mới là
bề mặt đang nhận dữ liệu sai.

## High (4)

### H1 — Phase 1 sửa `Artifact` cho năng lực installer đã có
`artifact-content.ts:51-62` `skillFiles()` đã duyệt cây sâu tuỳ ý, `IGNORE_DIRS`
(`install-types.ts:47-58`) đã có `.venv`, `__pycache__`, `node_modules`, `.pytest_cache`,
`dist`, `build`. Tiền đề "không có phase này thì không copy được phần lớn 103 skill" là
**sai**. Thêm `files[]` eager vào `Artifact` (20 module import) khiến `load-kit` dựng entry
cho ~1511 file mỗi lần gọi CLI, dưới ngân sách 200ms, để phục vụ đúng một consumer
(`document-skills`). Đồng thời tạo walker thứ hai lệch với walker của installer.
Whitelist frontmatter còn thêm nhầm `title/status/priority/effort/phase/dependencies/
branch/created/theme` — đó là header **plan file**, không phải skill; và
`allowed-tools`, `disable-model-invocation`, `license` đã có sẵn (`skill-lint.ts:21-31`).
→ Dùng lại `skillFiles()`, export `IGNORE_DIRS`. Chỉ thêm field frontmatter grep được ở
103 nguồn thật; phần còn lại đi qua `metadata`.

### H2 — Bằng chứng verify provider không lấy được; cổng mới sẽ làm hỏng provider đang chạy
`spec-verified.ts:3-4` trích `scripts/codex_generator*.py` và `scripts/generate-opencode.py`
làm nguồn verify — **cả hai không tồn tại trong repo** (đã tìm). `test-provider` là mock
nội bộ bị `index.ts:16` lọc khỏi danh sách công khai, `generic` không có target cho
agent/command. Áp tiêu chí "không ô nào verified mà thiếu bằng chứng" một cách trung thực
sẽ lật codex/opencode về unverified → `vc install --provider codex` đang chạy tốt bắt đầu
skip mọi artifact.
→ Nêu mục tiêu là 5 provider verify được từ bên ngoài; vendor generator tham chiếu vào
`packages/cli/reference/` hoặc ghi snapshot hash có ngày trước khi bật cổng.

### H3 — venv 383MB nằm trong cache đóng dấu version, không GC; script cài ra không executable
Venv nguồn thật là **383MB / 259 package** — lý do "tránh phình đĩa" của phase 3 ngược với
số đo. `embedded-kit.ts:13-16` `cacheRoot()` đóng dấu theo version, không nơi nào prune →
mỗi lần update bỏ lại 383MB và mọi skill Python về `missing`. Không `chmod` ở đâu trong
`install/`, `uninstall/`, `embedded-kit.ts` → 154 script cài ra mode 0644.
`artifact-content.ts:13-15` chỉ rewrite path/tool, không đụng shebang → script chạy bằng
Python hệ thống, không thấy venv.
→ venv ra ngoài root đóng dấu version, key theo hash dependency đã resolve, thêm GC vào
scope; `mode` vào manifest nhúng (chỉ `0644`/`0755`); phase 3 sở hữu hợp đồng interpreter
đầu-cuối (rewrite shebang hoặc wrapper `vc skill run`).

### H4 — Cache sentinel: verify một lần, đua tiến trình, hỏng thì không sửa được; cổng khởi động đo nhầm thứ
`embedded-kit.ts:22-34` bỏ qua toàn bộ extraction khi `.extracted` tồn tại, `writeFileSync`
không atomic, sentinel ghi cuối, không lock. Cache đóng dấu **version** nên mọi thay đổi
kit trong 10 phase đều dùng lại cache cũ → `vc validate` xanh trên kit trước đó. Khi phase
2 thêm "fail đóng", cache hỏng làm **mọi** lệnh chết kể cả lệnh sửa nó (`getKitRoot` nằm
trên đường của tất cả). Cổng khởi động chọn `vc --version` — lệnh **không bao giờ** gọi
`materializeEmbeddedKit` (`index.ts:44` đọc package.json), nên phép đo vô nghĩa. Literal
22MB base64 parse eager mỗi lần chạy.
Ngoài ra generator dùng `statSync` (đi theo symlink), không ignore list, không giới hạn độ
sâu; nguồn có 14 symlink; output là file **tracked trong git** → một symlink trỏ vào file
nhạy cảm sẽ được inline vào source và ship trong binary.
→ Đóng dấu cache theo hash `EMBEDDED_ASSETS`; extract ra temp dir rồi rename; verify khi
**đọc**; `lstatSync` + bỏ symlink + ignore list dùng chung; cổng khởi động dùng lệnh thật
sự materialize; nhúng lazy.

## Secondary — accepted, mức thấp hơn (8)

| # | Finding | Mức | Áp vào |
|---|---|---|---|
| S1 | `trust.passphrase` là secret plaintext, `config prefs resolve --json` in ra nguyên vẹn; sanitizer chỉ khớp tên **env var** (`credential-sanitizer.ts:23,33-39`), không đọc nội dung config | High | Phase 7 |
| S2 | Secret notification vượt sanitizer: hook là tiến trình riêng không import nó; webhook Discord/Slack giấu token trong **path** URL, `URL_USERINFO` chỉ khớp `user:pass@host`, `_URL` không nằm trong `SECRET_KEY` | High | Phase 6 |
| S3 | Đích webhook lấy từ config không ràng buộc → kênh exfil đặt được bởi project file; ràng buộc "không ghi ngoài thư mục sở hữu" chỉ nói về **filesystem**, không nói egress | High | Phase 6 |
| S4 | `kit/hooks/notifications/` bị `load-kit.ts:121-133` reject (thiếu `hook.json`) hoặc chỉ cài 1 file; ngân sách 150ms không đạt được vì mỗi hook spawn một tiến trình `node` (`install-plan.ts:103`) | High | Phase 6 |
| S5 | Exit code mới gán `2 = bad flags` phá hợp đồng CI của `doctor` (`doctor-command.ts:151-153`, `audit-score.ts:1-4` ghi rõ đây là CI contract); `vc kit validate` trùng `vc validate` | High | Phase 10 |
| S6 | `vc run <skill>` đụng subcommand `resume/status/cancel` đang có; skill tên `status` vĩnh viễn không gọi được; flag workflow-only không có nghĩa với skill; **chưa có skill runner nào trong repo** | High | Phase 10 |
| S7 | `adapt-decision-log.ts` là bề mặt log thứ ba; đã có `history/store.ts` JSONL + `vc query`, và `ReceiptSkip {kind,name,reason}` đã lưu mọi skip kèm lý do | Medium | Phase 5 |
| S8 | Chu trình 9↔10 không khai báo (phase 9 bước 6 chờ phase 10); `vc config prefs resolve --json` có hai chủ ở phase 7 và phase 10; số rules sai (3 hiện có + 7 thiếu = 10, không phải 8; `orchestration-protocol` bị bỏ sót) | Medium | plan.md, 7, 9, 10 |

## Ghi chú xuyên suốt

Quy tắc <200 LOC được phase 10 dùng làm tín hiệu cảnh báo, nhưng
`register-harness-commands.ts` đã 247 dòng và 17 file production đã vượt ngưỡng, không có
lint gate nào enforce. Không dùng được làm tripwire.

## Câu hỏi chưa giải quyết

1. Sau khi sửa C2, bản ghi nào là authoritative — chỉ `receipt.json`?
2. Nếu không phục hồi được generator tham chiếu cho codex/opencode, hạ cấp ô đó (regress
   install đang chạy) hay grandfathering bằng attestation có ngày?
3. `git` có bị `ak-git` ghi đè không? Đang chặn con số "103 skills".
4. `vc coverage` gỡ hẳn hay đổi thành phép đo đối chiếu kit với snapshot nguồn?

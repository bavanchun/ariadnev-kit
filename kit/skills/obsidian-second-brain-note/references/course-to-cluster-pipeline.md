# Course-to-Cluster Pipeline (Cluster Mode reference)

The packaged, parameterized version of an engagement pattern validated 4× (see §8). When Cluster Mode is selected, **follow this file**; do not re-invent the scaffolding or re-discover the bugs in §9. Only the per-domain *content* and *freshness research* are bespoke each run — everything structural below is fixed.

Pipeline: **Scout → (1 decision point) → /brainstorm → /ck:plan --hard → /ck:cook(parallel) → /excalidraw(inside P6) → /ck:journal**. After the decision point it runs autonomously; surface only a true BLOCKER or the final summary.

---

## §1 — The ONE decision point (4 standard questions, precedent defaults pre-filled)

Ask once via `AskUserQuestion`. Each option list leads with the precedent default labelled "(Recommended)". Ground options in scout findings (name the real precedent cluster).

1. **Cluster shape** — *Unified core + dialect/variant appendices (Recommended)* / two separate clusters / single merged. (For a single-tech course there are no "dialects"; collapse to: section notes + concepts + appendices as needed.)
2. **Domain folder** — *`<Domain>/<topic-slug>/` new or existing domain, peer of the precedent (Recommended)* / nest under an existing domain / flat in domain root.
3. **Depth** — *Full mastery: faithful to sources + augment (the production/advanced topics the source skips) grounded in current official docs via context7 (Recommended)* / faithful to sources only / sources + light modernization.
4. **Language** — *English (Recommended — matches every prior technical cluster)* / the source's language / Vietnamese.

These four are the genuine per-engagement decisions. Everything else uses precedent defaults silently.

## §2 — 7 phases (fixed)

| P | Owner | What |
|---|---|---|
| P1 | main + 1–2 `researcher` (parallel, background) | Read all sources; context7 freshness pass (pin current versions); `source-coverage-map.md` (source→note id; flag mastery-augment topics with NO source as research-grounded). |
| P2 | main, **sequential** | Course Hub (`moc`) + **frozen content contract** (§3). The contention keystone. Commit. Nothing parallel launches until §3 is complete. |
| P3 | subagent A (bg) | Section notes, first half of the spine. Owns `…/<topic>/<PREFIX>01..NN.md` only. |
| P4 | subagent B (bg) | Section notes, second half + appendices. Owns its disjoint range only. Heaviest — split if >12 notes. |
| P5 | subagent C (bg) | Atomic concept notes. Owns `<Domain>/Concepts/*` only. |
| P6 | subagent D (bg) | Diagrams via §4 pipeline. Owns `…/_diagrams-src/*` + `…/_attachments/*` only. |
| P7 | main, **sequential** | Domain MOC + Dashboard wiring (read both first) + the §6 quality gate + plan Validation Log. |

Dependency: `P1 → P2 → (P3 ∥ P4 ∥ P5 ∥ P6) → P7`. P3–P6 are write-disjoint by namespace AND semantically safe because P2 froze every shared contract.

## §3 — Frozen content contract (`research/frozen-inventory.md`) — the keystone

Parallel safety requires freezing not just filenames but every shared semantic. The contract MUST contain all of:

- **§a Literal section filenames** (exact on-disk basenames, parentheticals are scope hints NOT filename) + the prev/next chain.
- **§b Literal concept filenames.**
- **§c Concept adjacency graph** — each concept → ≥2 outbound sibling concepts + its owning section notes + Hub; built so ≥2-inbound + ≥2-outbound is provably satisfiable BEFORE launch (not discovered at P7).
- **§d Diagram slugs → embedding-note map.** Embed string is **`![[<slug>.png]]`** (NO `_attachments/` prefix — Obsidian resolves by filename; precedent-verified).
- **§e Shared content specs** consumed verbatim by note AND its diagram/sibling: any schema/ERD a note describes and a diagram draws; any worked example shared across notes; any matrix shared across note+concept+diagram; the single-source version strings (every "Modern note" quotes these).
- **§f Reusable callout templates** verbatim (section-note opener; the comparison/dialect callout; the `⚡ Modern note`). Do not let subagents invent admonition shapes. **Ensure template placeholder text does NOT contain a word on the §h denylist** (the "bootcamp" token clash — see §9).
- **§g Frontmatter templates** per note type, conforming to the vault's actual schema (detect it; never impose). Vault here uses Vietnamese dates `chủ nhật, DD/MM/YYYY`, `os`/`level` legacy keys, body starts `# Title`, no `# 📅 Daily` artifact.
- **§h Brand-scrub denylist** — author/instructor names, "Udemy", "Bootcamp"/"bootcamp", course/slide/lecture identifiers, the original branded case-study name. `source:` = a generic non-identifying string. P7 greps this.

After P2 the contract is immutable. Subagents are READ-ONLY on it. Any later naming/schema change is forbidden (breaks parallel cross-links).

## §4 — Diagram pipeline (offline, machinery-copy)

1. Copy the most recent precedent's `…/_diagrams-src/build-diagrams.py` **verbatim** (it is ~1000+ lines — DO NOT hardcode line numbers; they drift and have caused a zero-diagrams BLOCKER).
2. Replace ONLY the body between `DIAGRAMS = {` and its matching close before the EOF `# … emit files` block. Preserve everything above `DIAGRAMS = {` (PALETTE, `build()`, `build_svg()` incl. its label word-wrap) and the entire emit block byte-exact.
3. **Mandatory AST-parse gate before AND after editing**: `python3 -c "import ast; ast.parse(open('build-diagrams.py').read()); print('parses')"`. Non-parsing = zero diagrams = failure.
4. Run it; rasterize each `.svg`→`.png` via `/opt/homebrew/bin/rsvg-convert -z 2`. Spot-check ≤3 PNGs (not all — token cost). Spec-coupled diagrams use §e specs verbatim.
5. Commit in bounded batches (not one buffer — the 32k output ceiling killed a one-shot run): script first, then attachments+sources in 2–3 batches.

## §5 — Parallel subagent dispatch

Spawn P3/P4/P5/P6 as background `general-purpose` agents in one batch. Each prompt MUST be self-contained (context isolation — no session history) and include: work-context (vault root) · STEP 0 = read `frozen-inventory.md` §a–§h + research + ONE precedent note of the same type for SHAPE · **strict file ownership** (exact glob; "NEVER touch anything else") · the per-note skeleton · the §6/§7 commit rules + parallel guard · "write+commit ONE note at a time, never buffer (32k ceiling)" · heredoc fallback if a Write is privacy-blocked · "all names strictly from frozen-inventory — never invent". End-of-run report format: files written, commit hashes, blockers, `Status: DONE|BLOCKED`.

Blocked-phase recovery: NEVER resume inline-concurrent (re-introduces write contention). Restart as a fresh isolated subagent from the last committed item, or defer into the P7 sequential window.

## §6 — Quality gate script (P7) — copy-paste, known-bug fixes baked in

Run from vault root. Adjust `DOM`/`DIR`/`PREFIX`. **All glob includes are quoted** (zsh expands `--include=*.md` → false orphan scare — known bug, fixed here).

```bash
DOM="Database"; DIR="Database/sql-mastery"; PFX="S"   # ← parameterize per engagement
echo "== counts ==" ; ls "$DIR"/${PFX}*.md 2>/dev/null | wc -l ; ls "$DOM"/Concepts/*.md 2>/dev/null | wc -l ; ls "$DIR"/_attachments/*.png 2>/dev/null | wc -l
echo "== brand denylist (expect 0) ==" ; grep -rIE 'Colt Steele|Udemy|[Bb]ootcamp|Bret Fisher|instagram clone|\blecture\b' "$DOM"/ 2>/dev/null | wc -l
echo "== schema ==" ; grep -rl 'created: chủ nhật' "$DOM"/ 2>/dev/null | wc -l ; grep -rl '# 📅 Daily' "$DOM"/ 2>/dev/null | wc -l   # 2nd expect 0
echo "== concept density (each >=2 in, >=2 out) ==" ; for f in "$DOM"/Concepts/*.md; do b=$(basename "$f" .md); o=$(grep -oE '\[\[[^]]+\]\]' "$f"|grep -v 'Course Hub'|sed 's/|.*//'|sort -u|wc -l); i=$(grep -rl --include='*.md' -F "[[$b]]" "$DOM"/ 2>/dev/null|grep -v "Concepts/$b.md"|wc -l); echo "$b out=$o in=$i"; done
echo "== orphan S-notes (expect none) ==" ; for f in "$DIR"/${PFX}*.md; do b=$(basename "$f" .md); c=$(grep -rl --include='*.md' -F "[[$b" "$DOM"/ 2>/dev/null|grep -v "$b.md"|wc -l); [ "$c" -lt 1 ] && echo "ORPHAN $b"; done
echo "== png embeds resolve ==" ; grep -rho --include='*.md' '!\[\[[a-z0-9-]*\.png\]\]' "$DOM"/ 2>/dev/null|sed -E 's/!\[\[//;s/\]\]//'|sort -u|while read p; do [ -f "$DIR/_attachments/$p" ]||echo "MISSING $p"; done
echo "== chain ==" ; grep -c "$DOM/$DOM MOC" Dashboard.md ; grep -c 'Course Hub' "$DOM/$DOM MOC.md"
echo "== clean tree (only .obsidian churn ok; no pdf/zip) ==" ; git status --porcelain | grep -ivE '\.obsidian/|^\?\? ' ; git status --porcelain | grep -icE '\.pdf|\.zip'
```
Also manually verify **content-agreement**: every §e-coupled note and its diagram share the identical schema/example/matrix; version strings consistent across all notes.

## §7 — Commit & VCS rules

- One conventional commit per finished note: `docs(<slug>): add <thing>`. Plan files: `chore(plans): …`. `.claude/` files: only `feat|fix|perf` (never `docs`/`chore`).
- Stage the single file explicitly. NEVER `git add -A`. NEVER stage `.obsidian/`, source PDFs/zip, secrets.
- Bypass hooks for the batch: `git -c core.hooksPath=/dev/null commit -m "…"`.
- Parallel `index.lock` guard (subagents commit concurrently):
  `for i in $(seq 1 20); do git -c core.hooksPath=/dev/null commit -m "MSG" 2>/tmp/e && break || (grep -qiE 'index.lock|cannot lock ref|another git' /tmp/e && sleep $((RANDOM%4+2)) || break); done`
- 32k output-token ceiling is real: subagents write+commit ONE artifact at a time, never buffer many.
- Push only when the user asks (offer it in the final summary).

## §8 — Precedent cluster registry (mirror the most recent for SHAPE)

| Cluster | Path | Plan |
|---|---|---|
| Spring Security | `Backend/Spring-boot/spring-security-zero-to-master/` | `plans/260516-2334-spring-security-master-notes/` |
| Flutter & Dart | `Flutter-and-Dart/` (master-notes) | `plans/260516-2127-flutter-dart-master-notes/` |
| Docker & Kubernetes | `DevOps/docker-and-kubernetes-mastery/` | `plans/260517-docker-k8s-mastery-notes/` |
| SQL (MySQL+PostgreSQL) | `Database/sql-mastery/` | `plans/260517-sql-mastery-notes/` |

Always scout the **most recent completed** one as the live template (note shape, frontmatter per type, `build-diagrams.py`, MOC/Dashboard wiring). Append new clusters here after delivery.

## §9 — Known failure modes (do NOT re-discover; red-team only the NEW parts)

1. **Stale line-number instruction for `build-diagrams.py`** → truncated script → zero diagrams. Fix: copy-up-to-`DIAGRAMS = {` + AST gate (§4). Never cite line numbers.
2. **Unfrozen shared schema/example/matrix** → note and its diagram diverge silently, no gate catches it. Fix: §3 §e.
3. **Wrong embed string** `![[_attachments/slug.png]]` → all embeds dangle. Fix: `![[slug.png]]` (§3 §d).
4. **zsh `--include=*.md`** glob-expands → false orphan/inbound scare. Fix: quote it `--include='*.md'` (baked into §6).
5. **§f callout template contains a §h-denylisted word** (e.g. "bootcamp" placeholder) → subagents emit it → brand gate fails. Fix: scrub placeholder wording in §3 §f; subagents resolve in favor of the §h gate.
6. **Inline recovery of a blocked parallel phase** → write contention with a still-running sibling. Fix: §5 recovery rule.
7. **Subagent 32k output ceiling** → produces nothing. Fix: one-artifact-at-a-time commit (§7); main-agent recovery preserves machinery byte-exact.
8. **Dashboard/MOC pattern assumed** → wrong wiring. Fix: P7 reads `Dashboard.md` + the precedent `<Domain> MOC.md` before editing.

Because §9 is encoded, `/ck:plan --hard`'s red-team should focus its scrutiny on the NEW per-domain content/structure, not re-litigate these.

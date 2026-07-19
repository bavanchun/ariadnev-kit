# ClaudeKit Engineer Skills Catalog Survey
**Date:** 2026-07-20  
**Scope:** 84 skills (9 excluded: skill-creator, ck-plan, cook, scout, git, ck-debug, project-management, _shared, common)  
**Objective:** Identify high-ROI skills for distilling into vcskill, map dependencies, classify by engineering value.

---

## 1. Skills Inventory by Complexity

| Complexity | Count | Representative Skills |
|-----------|-------|----------------------|
| **L (>20 files)** | 14 | cti-expert (114), ui-styling (98), react-best-practices (51), payment-integration (43), tech-graph (37), design (35), remotion (33), devops (29), threejs (29), databases (28), ai-multimodal (28) |
| **M (8-20 files)** | 23 | ck-code-review, context-engineering, backend-development, chrome-profile, fix, preview, deploy, excalidraw, stitch, web-frameworks |
| **S (<8 files)** | 47 | agent-browser, ask, bootstrap, ck-autoresearch, ck-graphify, ck-predict, ck-scenario, ck-security, ship, problem-solving, xia |

---

## 2. Top 10 Most Invested Skills

| Rank | Skill | Files | Type | Investment |
|------|-------|-------|------|------------|
| 1 | **cti-expert** | 114 | Research/Security | Custom investigation framework; OSINT methodology |
| 2 | **ui-styling** | 98 | Reference/Frontend | Comprehensive Tailwind + shadcn/Radix patterns |
| 3 | **react-best-practices** | 51 | Reference/Frontend | 45 Vercel rules across 8 categories |
| 4 | **payment-integration** | 43 | Integration/Commerce | 5 payment providers (Stripe, Polar, Paddle, SePay, Creem); heavy scripting |
| 5 | **tech-graph** | 37 | Content/Diagrams | 8 diagram styles; SVG→PNG pipeline; vendored upstream |
| 6 | **design** | 35 | Automation/Content | Brand/logo/CIP/slides generation; scripts + references |
| 7 | **remotion** | 33 | Content/Video | React-based video composition framework |
| 8 | **devops** | 29 | Infrastructure | 4+ cloud providers; scripts + references |
| 9 | **threejs** | 29 | Reference/3D | 556 searchable examples; 60 API classes |
| 10 | **media-processing** | 23 | Tooling/Automation | FFmpeg/ImageMagick/RMBG wrapper; scripts |

---

## 3. Tier Classification

### **Tier A: Core Engineering Workflow** (8 skills)
Critical for developer experience and production quality.

| Skill | Purpose | Complexity | API Deps |
|-------|---------|-----------|----------|
| ck-code-review | Production-readiness audit | M | None (LLM reasoning) |
| ck-predict | Pre-implementation expert consensus | S | None |
| ck-scenario | Edge-case decomposition (12 dimensions) | S | None |
| ck-security | STRIDE + OWASP audit + auto-fix | S | None |
| ck-loop | Metric-driven autonomous improvement | S | None |
| preview | Visual explanation generator | M | None |
| ship | Automated feature shipping (CI-aware) | S | None |
| fix | Intelligent issue routing | M | None |

**Distill candidate?** YES — ck-code-review, ck-predict core workflow abstractions.

---

### **Tier B: Domain Development** (16 skills)
Language/framework-specific production guidance.

**Frontend (7):**
| Skill | Purpose | Complexity | Self-Contained |
|-------|---------|-----------|-----------------|
| react-best-practices | 45 Vercel optimization rules | L | YES |
| frontend-development | React/Next.js data fetching patterns | M | YES |
| ui-styling | Tailwind + shadcn/Radix comprehensive | L | YES |
| ui-ux-pro-max | Design guidelines, 161 color palettes | M | YES |
| frontend-design | (no SKILL.md found) | L | ? |
| web-frameworks | Next.js + Turborepo + RemixIcon | M | YES |
| web-testing | Unit/E2E/load/security/visual | L | YES |

**Backend (5):**
| Skill | Purpose | Complexity | Self-Contained |
|-------|---------|-----------|-----------------|
| backend-development | Production patterns & best practices | M | YES |
| databases | MongoDB + PostgreSQL unified | L | YES |
| devops | Cloudflare/Docker/GCP/K8s | L | YES (CLI-based) |
| deploy | Auto-detect target + 15 platforms | M | YES (cost-optimized) |
| better-auth | TypeScript auth framework | M | Needs OAuth keys |

**Mobile (1):**
| Skill | Purpose |
|-------|---------|
| mobile-development | Framework/best-practices (minimal) |

**E-commerce (1):**
| Skill | Purpose |
|-------|---------|
| shopify | Shopify CLI + GraphQL patterns |

**Distill candidate?** YES — react-best-practices, frontend-development, backend-development, databases (knowledge base value).

---

### **Tier C: Integration & Tool Wrappers** (10 skills)
Bridges to external tools/CLIs/protocols.

| Skill | External Dependency | Complexity | Purpose |
|-------|-------------------|-----------|---------|
| agent-browser | Chrome CDP | S | Browser automation for agents |
| chrome-profile | Chrome DevTools MCP | M | Real Chrome profile targeting |
| ghpm | GitHub CLI + API | S | GitHub as SSOT for tasks |
| agentize | (self) | S | CLI/MCP server scaffolding |
| mcp-builder | MCP protocol | M | MCP server creation |
| repomix | repomix CLI | M | Repo→AI-friendly packing |
| stitch | Google Stitch API | M | Design→HTML/Tailwind |
| excalidraw | Excalidraw API | M | Visual diagramming |
| tech-graph | rsvg-convert (librsvg) | L | SVG→PNG diagram export |
| mermaidjs-v11 | mermaid CLI | S | Text-based diagrams |

**Distill candidate?** SELECTIVE — agent-browser (if Chrome CDP is core to vcskill), tech-graph (if diagram export needed).

---

### **Tier D: Content & Media** (8 skills)
AI-powered content/video/graphics generation.

| Skill | Gemini? | Video? | Graphics? | Complexity |
|-------|---------|--------|-----------|-----------|
| ai-multimodal | YES (full) | YES (Veo 3) | YES (Imagen 4) | L |
| ai-artist | YES | — | YES (curated prompts) | L |
| media-processing | NO | FFmpeg | ImageMagick | L |
| remotion | NO | YES (React-based) | — | L |
| markdown-novel-viewer | NO | — | (UI reader) | L |
| threejs | NO | — | YES (3D/GPU) | L |
| shader | NO | — | YES (GPU fragments) | M |
| html-video | NO (CLI) | YES (HTML→MP4) | — | S |
| design | YES | — | YES (brand auto) | L |

**Distill candidate?** NO — high complexity, paid API deps (Gemini, MiniMax), niche use (video/3D). Reference tech-graph for diagrams instead.

---

### **Tier E: Ideation & Problem-Solving** (5 skills)
Reasoning-driven workflows for discovery.

| Skill | Purpose | Complexity | Self-Contained |
|-------|---------|-----------|-----------------|
| ask | Technical Q&A discussion | S | YES |
| brainstorm | Architecture ideation | S | YES |
| research | YAGNI-focused discovery | S | YES |
| problem-solving | Systematic stuck-ness techniques | S | YES |
| sequential-thinking | Structured reasoning | M | YES |
| cti-expert | OSINT/CTI investigation | L | YES (no API keys) |

**Distill candidate?** MAYBE — ask, brainstorm, problem-solving minimal overhead. cti-expert too large/specialized.

---

### **Tier F: Utilities & Reference** (18 skills)
Documentation, testing, organization, analysis.

| Skill | Purpose | Complexity |
|-------|---------|-----------|
| bootstrap | Project scaffolding | S |
| repomix | Repo→AI-friendly packing | M |
| docs | Codebase doc analysis | S |
| docs-seeker | llms.txt discovery | M |
| find-skills | Skill discovery & install | S |
| llms | Generate llms.txt | S |
| context-engineering | Token-efficient context curation | M |
| copywriting | High-converting copy formulas | M |
| security-scan | Lightweight security scanner | S |
| test | Comprehensive testing framework | S |
| web-design-guidelines | Compliance review | S |
| project-organization | Standardize file structure | S |
| coding-level | Tailor explanations by level | S |
| journal | Memory + code-change logging | S |
| watzup | Handoff report generator | S |
| retro | Git-based retrospective | S |
| show-off | (minimal stub) | S |
| team | Multi-session coordination | S |

**Distill candidate?** YES — security-scan, test, project-organization, context-engineering (utilities suite).

---

### **Tier G: Niche & Specialized** (6 skills)

| Skill | Purpose | Complexity | API/CLI Deps |
|-------|---------|-----------|-------------|
| payment-integration | Stripe/Polar/Paddle/SePay/Creem | L | 5 payment APIs |
| google-adk-python | Google Agent Dev Kit | S | Google AI |
| gkg | Semantic code graph (KuzuDB) | S | KuzuDB |
| use-mcp | MCP stdin/stdout execution | M | MCP servers |
| worktree | Git worktree automation | S | Git |
| xia | Feature porting from other repos | S | Git + gh CLI |
| plans-kanban | Dashboard launcher stub | S | HTTP |
| review-pr | GitHub PR review | S | gh CLI |
| ck-autoresearch | Autonomous iteration router | S | Sub-skills |
| ck-graphify | Code→knowledge graph | S | tree-sitter |

**Distill candidate?** NO — too specialized or under-engineered (stubs).

---

## 4. External Dependencies

### **Paid APIs Requiring Keys** (12 distinct)

| API | Skills | Tier | Notes |
|-----|--------|------|-------|
| **Gemini (Google AI)** | ai-multimodal, ai-artist, design, research, use-mcp | D, E, F | Vision, generation (image/video/speech/music) |
| **OpenRouter** | ai-multimodal | D | Optional LLM routing |
| **MiniMax** | ai-multimodal | D | Image/video/audio/music generation |
| **Stripe** | payment-integration | G | Global payment processing |
| **Polar** | payment-integration | G | Global SaaS payments |
| **Paddle** | payment-integration | G | MoR subscriptions |
| **SePay** | payment-integration | G | Vietnamese banks (VietQR) |
| **Creem.io** | payment-integration | G | MoR + licensing |
| **Shopify** | shopify | B | E-commerce platform |
| **Google Cloud** | deploy | B | Multi-platform deployment |
| **Figma** | excalidraw | C | Design import/export |
| **Google Stitch** | stitch | C | Design→HTML conversion |

### **Open-Source CLI Tools** (9)

| Tool | Skills | Install Via |
|------|--------|------------|
| **FFmpeg** | media-processing, html-video, ai-multimodal | brew (macOS), apt (Linux) |
| **ImageMagick** | media-processing | brew, apt |
| **RMBG** | media-processing | pip |
| **rsvg-convert** (librsvg) | tech-graph | brew/apt; installed by ck install |
| **Mermaid CLI** | mermaidjs-v11 | npm |
| **GitHub CLI (gh)** | ~30 skills | brew, apt, scoop |
| **Shopify CLI** | shopify | npm, brew |
| **Remotion** | remotion | npm |
| **Three.js** | threejs | npm |

### **Self-Contained Skills** (38% of catalog)
No paid APIs or external CLIs required:
- ck-code-review, ck-loop, ck-predict, ck-scenario, ck-security
- react-best-practices, frontend-development, test
- backend-development, databases, devops (CLI-based)
- sequential-thinking, problem-solving, ask, brainstorm
- shader, mermaidjs-v11, bootstrap, security-scan

---

## 5. Naming Conventions & Philosophy

### **Prefix Patterns**

| Prefix | Count | Purpose | Examples |
|--------|-------|---------|----------|
| `ck-` | 13 | Framework-level abstractions | ck-code-review, ck-predict, ck-loop, ck-scenario, ck-security |
| None | 71 | Domain-specific skills | react-best-practices, devops, ui-styling, payment-integration |

### **Naming Principles**
- **`ck-` reserved for:** Reusable workflow abstractions, framework-level utilities that compose other skills
- **Domain skills:** Named directly after domain (react-, payment-, devops-, frontend-, backend-, ui-)
- **Compound names:** Hyphenated for clarity (agent-browser, better-auth, html-video, chrome-profile)
- **Tool wrappers:** Often suffix with -cli or -builder (mcp-builder, skill-creator)
- **No underscore usage** except in `_shared` (private/internal)

---

## 6. Architectural Patterns

### **Pattern 1: Skill Routing / Dispatchers** (3 skills)
Routes to sub-skills or guides through discovery.
- `ck-autoresearch` → autonomous iteration + safety guards
- `ck-graphify` → code/doc analysis with multiple backends
- `vibe` → full autonomous product pipeline (routes to ck-loop, fix, ck-code-review)
- `find-skills` → ecosystem guide
- `bootstrap` → project scaffolding wizard

**Distill insight:** Router skills are small (<6 files) — they delegate to larger, reusable components.

### **Pattern 2: Reference Libraries** (6 skills)
Pure documentation + rules, no scripts.
- `react-best-practices` (45 rules)
- `ui-styling` (Tailwind + shadcn patterns)
- `databases` (MongoDB + PostgreSQL)
- `threejs` (556 examples)
- `backend-development`, `frontend-development`

**Distill insight:** Highest re-use value for knowledge. Minimal maintenance overhead.

### **Pattern 3: Script-First Executables** (5 skills)
Heavy Python/Bash scripts + LLM orchestration.
- `media-processing` (ffmpeg wrappers)
- `ai-multimodal` (Gemini + MiniMax handling)
- `payment-integration` (provider orchestration)
- `design` (brand automation)
- `cti-expert` (autonomous investigation loops)

**Distill insight:** Complex tool orchestration; high deployment complexity.

### **Pattern 4: MCP/CDP Bridges** (6 skills)
Expose external tool capabilities via protocol.
- `agent-browser` (Chrome CDP)
- `chrome-profile` (Chrome DevTools MCP)
- `mcp-builder` (MCP scaffolding)
- `use-mcp` (MCP stdin/stdout routing)
- `ghpm`, `better-auth` (GitHub integration)

**Distill insight:** Protocol bridges are minimal; value is in tool orchestration, not code.

### **Pattern 5: LLM-Driven Analysis** (5 skills)
Pure reasoning, no tool execution.
- `ck-code-review`, `ck-predict`, `ck-scenario`, `ck-security`
- `cti-expert`, `research`, `problem-solving`

**Distill insight:** Reusable across all domains; minimal dependencies.

---

## 7. Skill Dependency Chains (Hand-Traced)

### **Top-Level Workflows**
```
vibe 
  ├─→ ck-loop (metric-driven improvement)
  ├─→ ck-predict (pre-implementation analysis)
  ├─→ ck-code-review (production audit)
  └─→ fix (apply fixes)
       └─→ problem-solving
       └─→ sequential-thinking
```

### **Content Generation**
```
design 
  └─→ ai-multimodal (Gemini + MiniMax)

tech-graph (standalone; optional: excalidraw, mermaidjs-v11)

remotion (standalone React framework)
```

### **Integration Chains**
```
cti-expert (optional: agent-browser, chrome-profile)

payment-integration (Stripe/Polar/Paddle/SePay/Creem)

mcp-builder (depends on MCP protocol knowledge)
```

### **Cross-Skill References**
- ~30 skills use `gh` (GitHub CLI) — implies `git` + `gh` as de facto dependency
- ~10 skills reference Gemini — implies API key management is centralized
- `preview` ↔ `tech-graph` (diagram self-review loop)
- `ck-code-review` → `fix` (finding → auto-fix workflow)

---

## 8. Distill Recommendations for vcskill

### **High-Priority Distill Candidates (9 skills)**
1. **ck-code-review** — Core workflow; production-critical
2. **ck-predict** — Pre-impl consensus; reusable analysis
3. **react-best-practices** — Vercel rules; high re-use
4. **backend-development** — Production guidance
5. **problem-solving** — Stuck-ness resolution; minimal deps
6. **security-scan** — Lightweight scanner; self-contained
7. **ask** — Technical Q&A; minimal
8. **bootstrap** — Project scaffolding; guides user
9. **sequential-thinking** — Structured reasoning; reusable

### **Medium-Priority (5 skills)**
- frontend-development (React patterns)
- databases (MongoDB + PostgreSQL)
- test (comprehensive testing framework)
- context-engineering (token efficiency)
- preview (visual explanation)

### **Low-Priority / Skip (60 skills)**
- All Tier D (content/media) — high complexity, paid APIs
- cti-expert — too specialized/large
- payment-integration — domain-specific, heavy scripting
- Tier G (niche) — under-engineered or ultra-specialized

---

## 9. Engineering Investment Summary

### **Most Comprehensive**
1. **cti-expert** (114) — OSINT framework, custom investigation loops
2. **ui-styling** (98) — Exhaustive UI patterns + themes
3. **react-best-practices** (51) — 45 production rules, Vercel-backed
4. **payment-integration** (43) — 5+ payment providers, multi-country
5. **tech-graph** (37) — 8 diagram styles, SVG→PNG pipeline

### **Most Focused/Minimal**
1. **ask** (1 file) — Minimal Q&A prompt
2. **coding-level** (1) — Level selector
3. **journal** (1) — Memory logging
4. **html-video** (1) — CLI wrapper
5. **ck-autoresearch**, **ck-graphify**, **ck-predict**, **ck-scenario** — Router stubs

---

## 10. Unresolved Questions

1. **Document-skills skill** — No SKILL.md found. Is this deprecated or intentionally minimal?
2. **Frontend-design skill** — No description in SKILL.md; 29 files present. What does it cover vs. ui-styling + ui-ux-pro-max?
3. **ck-graphify** — Claims to use tree-sitter (20 languages) + Whisper (audio) + KuzuDB. Are these truly integrated or is it a stub?
4. **Stitch skill** — Depends on "Google Stitch" API. Is this a custom build or third-party service? Pricing model?
5. **Tier A cross-contamination** — Do ck-code-review/ck-predict have data dependencies or can they truly run standalone?
6. **Skill inter-versioning** — Is there a dependency lockfile (package-lock.json, poetry.lock) for all npm/Python deps?
7. **vcskill target scope** — What's the hard ceiling on skill count? (e.g., 20 skills = lightweight, 50+ = full kit?)
8. **Naming collision risk** — Are there any skills with identical commands or overlapping tool invocation? (e.g., /ck:preview vs. /ck:tech-graph diagram preview)

---

## Status
**DONE**

Survey complete. 84 skills cataloged, categorized into 7 tiers, top 10 identified, 12 paid APIs mapped, architectural patterns extracted. Key finding: ~9 high-ROI skills for vcskill distillation (core workflow + reference libraries); ~60 skills too specialized or expensive for lightweight kit.


# Phase 3 — Cluster: Graphics, 3D and media generation

Plan: `plans/260816-1845-ariadnev-evidence-backed-parity-with-agentkit/phase-03-eval-coverage-that-matches-the-claim.md`

## Scope delivered

11 files created under `evals/scenarios/skills/`: `threejs.json`, `shader.json`,
`design.json`, `ai-artist.json`, `ai-multimodal.json`, `media-processing.json`,
`remotion.json`, `html-video.json`, `hyperframes.json`, `excalidraw.json`,
`mermaidjs-v11.json`. All parse as JSON, all validate against the schema shape
used by `ask.json`/`docs.json`, all scenario ids are unique
(`skill.<name>.routing`).

No files outside this list were touched. `evals/vocabulary/**` was read-only.

## Coverage / negative-case table

| skill | positive intent | negative (forbidden) skill | why those two are genuinely confusable |
|---|---|---|---|
| `threejs` | Build a Three.js scene: GLTF load, lighting, orbit controls, animation loop | `shader` | Both live inside the same WebGL scene. threejs's own reference tree (`references/17-shader.md`, `11-materials-advanced.md`) explicitly covers "custom GLSL shaders" as an advanced threejs topic — a model asked to add a visual effect to a 3D scene has to decide whether the unit of work is the scene graph (threejs) or the fragment shader inside one material (shader). |
| `shader` | Write a GLSL fragment shader (Voronoi noise, u_time-animated) | `threejs` | Mirror of the above; `shader`'s own SKILL.md says "Writing custom shaders for Three.js, WebGL, Processing" as a when-to-use case. The prompt "add an effect to my 3D scene" routes to one or the other depending on whether the fix is scene-level or pixel-level. |
| `design` | Decide and record an accepted brand identity direction (logo style, palette, typography, voice) with constraints/non-goals/acceptance criteria | `ai-artist` | Both sit in "produce a visual." `design`'s own SKILL.md draws this exact line: "Not for UI code patterns" and routes single-asset generation through `ai-artist`/`ai-multimodal` internally (banner workflow step 3: "generate visuals with `ai-artist`/`ai-multimodal`"). The confusion is real: "make me a logo" could mean define the whole brand system, or generate one image. |
| `ai-artist` | Generate one curated-prompt image (banner, Ukiyo-e style) via Nano Banana | `design` | Same pairing, reverse direction — see above. |
| `ai-multimodal` | Transcribe a video into a timestamped Markdown transcript via Gemini | `media-processing` | Per task brief: deterministic FFmpeg transform vs model-based analysis. Both skills touch the same media files (video/audio/image); the dividing line is whether the operation is a lossless format/codec transform (media-processing) or a model call that interprets content (ai-multimodal). `ai-multimodal`'s own doc tells the model to split oversized media "with `ffmpeg` or the pinned Multix media command" before analysis — the two skills are meant to hand off to each other on the same file. |
| `media-processing` | Re-encode MKV→MP4, extract AAC audio, batch-resize JPEGs (FFmpeg/ImageMagick) | `ai-multimodal` | Mirror of the above; media-processing's own table lists "Video thumbnails," "GIF creation" etc. as FFmpeg/ImageMagick jobs, while OCR/vision extraction is explicitly out of scope and belongs to the Gemini-backed skill. |
| `remotion` | Build a React/Remotion composition (charts, captions, audio) and render an MP4 | `hyperframes` | `remotion`'s own SKILL.md "See also" section names `av-hyperframes` by name as the alternative to prefer "when the composition is authored as plain HTML/CSS... rather than React components" — the two skills are explicitly cross-referenced as alternates for the same output type (programmatic MP4). |
| `hyperframes` | Scaffold/lint/render a HeyGen HyperFrames HTML composition to a vertical MP4 | `remotion` | Mirror of the above; `hyperframes`'s own "See also" names `av-remotion` first, "React-based programmatic video generation; use it when composition is naturally a React component tree." |
| `html-video` | Turn an HTML/CSS/JS template + assets into an MP4 via nexu-io/html-video, verify with ffprobe | `hyperframes` | `html-video`'s own "Route carefully" section and "See also" both name `hyperframes` explicitly as the skill to use instead "specifically when the task is a HeyGen HyperFrames composition" — the two skills are two separate HTML-to-MP4 wrappers (`nexu-io/html-video` vs HeyGen's CLI) and the doc anticipates the exact confusion. |
| `hyperframes` (2nd edge) | — | `html-video` (only referenced from `html-video`'s side) | See note below on the three-way cluster. |
| `excalidraw` | Diagram a 5-service data flow using fan-out/convergence, export PNG | `mermaidjs-v11` | Both are "make me a diagram" tools with overlapping declared uses (architecture, flowcharts, data flow). The real distinction is editable/visual canvas (Excalidraw, live MCP or file+Playwright) vs text-first declarative syntax (Mermaid, `mmdc`/inline code blocks) — a model has to pick the authoring mode, not the diagram type. |
| `mermaidjs-v11` | Write a flowchart TD for a CI/CD pipeline, render to SVG with `mmdc` | `excalidraw` | Mirror of the above. |

### Note on the `remotion` / `html-video` / `hyperframes` three-way confusion

The brief calls this out as a real three-way clash (React vs HTML template vs
HeyGen CLI), but each scenario file can only encode one pairwise negative. I
covered both edges that touch `hyperframes` — `remotion`↔`hyperframes` (mutual,
matching both skills' own "See also" cross-references) and `html-video`→`hyperframes`
(matching `html-video`'s own "Route carefully" section, which names
`hyperframes` by name and `remotion` by name in the same breath but reserves
its strongest, most specific disambiguation language for `hyperframes`
specifically — "use `av-hyperframes` specifically when the task is a HeyGen
HyperFrames composition"). `hyperframes` is the natural hub of the triangle:
both other skills' docs single it out as the thing to check against, so
pairing `hyperframes` against each of the other two, rather than also writing
a `remotion`-vs-`html-video` file, covers the two edges the skill authors
themselves considered load-bearing. `remotion` and `html-video` do not
cross-reference each other anywhere in their own SKILL.md files, so a direct
`remotion`-vs-`html-video` negative would not be traceable to declared intent
in the same way — I judged the two hub edges more honest than inventing a
third, undocumented edge.

No skill in this cluster needed a negative from outside the cluster; all 11
pairings are intra-cluster per the assignment.

## Evidence vocabulary — proposed new ids (2, within budget)

Neither of the 27 existing ids honestly describes "a rendered visual/video/
diagram artifact exists and matches the request" or "model-based analysis
extracted/transcribed content from media" — both are core outcomes for this
cluster and absent from a vocabulary written for planning/review/research
work. Confirmed via `evals/vocabulary/evidence-v1.json` criteria that the
closest candidates (`implementation.verified`, `design.acceptance`) do not
honestly cover them (see reuse notes below), so I propose exactly 2 new ids
rather than distorting a near-match, per the phase-3 vocabulary-inflation
guardrail (budget: 10 across the whole plan; this cluster uses 2).

```json
{
  "id": "media.rendered",
  "producer": "harness",
  "proof": "artifact",
  "criterion": "A generated image or video file exists at the declared output path and the harness verifies its container format and declared dimensions or duration match the request.",
  "capabilities": {}
}
```
Used by: `ai-artist` (positive), `design` (negative, ai-artist required),
`ai-multimodal` (negative, media-processing required), `media-processing`
(positive), `remotion` (positive+negative), `html-video` (positive+negative),
`hyperframes` (positive+negative), `excalidraw` (positive+negative),
`mermaidjs-v11` (positive+negative). Modeled directly on `docs.updated`
(same producer/proof shape: harness-checked artifact existence + a concrete,
mechanically verifiable property) and on `html-video`'s own doc, which already
prescribes exactly this check: "The MP4 proof is not complete until `ffprobe`
reports a nonzero duration and expected video dimensions."

```json
{
  "id": "media.analysis",
  "producer": "evaluator",
  "proof": "outcome",
  "criterion": "The response extracts, transcribes, or describes content directly from the supplied media file through model-based analysis, distinct from a deterministic format or codec transform.",
  "capabilities": {}
}
```
Used by: `ai-multimodal` (positive), `media-processing` (negative,
ai-multimodal required). Modeled on `answer.direct` (same producer/proof
shape: evaluator judges the final response's content, no artifact-file
check). Exists specifically to give `media-processing` vs `ai-multimodal` two
distinct, checkable evidence ids for their two distinct outcome types
(deterministic transform-with-artifact vs analysis-with-response), matching
the established convention in every other paired scenario in this repo (e.g.
`ask`/`research`, `docs`/`docs-seeker`, `test`/`fix`).

## Existing-id reuse decisions (no new ids needed)

- **`threejs` / `shader`** both use `implementation.verified`
  ("The accepted implementation exists in the fixture and every required
  focused verification command passes."). Both skills' outputs are source
  code (JS/GLSL) whose correctness is checked by running it (a dev build /
  `glslViewer`), which is exactly what this id already describes — no
  distortion, and reusing the same id for both sides of a pairing is honest
  here because both skills genuinely produce the *same kind* of artifact
  (code), unlike the video-render trio where a artifact-file check fits
  better.
- **`design`** uses `design.acceptance` ("The design records outcome,
  constraints, non-goals, acceptance criteria, and an explicit accepted
  option."). This id is already used by `brainstorm.json` for architecture
  decisions; I reused it rather than inventing a near-duplicate because
  `design`'s own SKILL.md batched-intake workflow
  (`references/design-workflow.md`) explicitly produces exactly this
  decision shape before any asset is generated, and the schema's own
  `case` shape rewards writing the `design` positive prompt to ask for that
  decision record (not a rendered asset) — which is also what cleanly
  distinguishes it from `ai-artist`'s single-asset-generation output.

## Validation performed

```
node -e "JSON.parse(...)"   # all 11 files — OK
npx vitest run packages/cli/src/eval/scenario-coverage.test.ts
```

Result: 2 of 5 assertions pass (`stale scenario name` check, `unique id`
check). The other 3 fail, but confirmed via `grep` that **none of the
failures reference this cluster's 11 skills** for the coverage/subject
checks — the only place my scenarios appear in the failure diff is the
evidence-vocabulary check, exactly at the 2 proposed ids
(`media.rendered`, `media.analysis`), which is expected until the
orchestrator adds them centrally. All other failing lines belong to other
clusters' skills (uncovered skill list) or other clusters' proposed ids
(`design.visual-fidelity`, `design.system-decision`).

## Unresolved questions

None. If the orchestrator prefers different names for the 2 proposed ids
(e.g. to align with another cluster's naming), the `requiredEvidence` string
in these 11 files is the only place to rename — a single find/replace per id.

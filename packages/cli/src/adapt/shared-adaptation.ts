// One file, several providers, one set of bytes.
//
// `.agents/skills` is not a private root. codex (under global scope), cursor,
// omp, dsh and generic all resolve to it, because it is the neutral cross-tool
// layout each of them was evidenced — or conventioned — to read. That much is
// deliberate. What was not deliberate is that `adaptArtifact` gives each of
// them a *different* body for the same path: codex takes verified tool rewrites
// and a Codex footer, cursor takes minimal rewrites and a Cursor footer, omp
// takes neither. Providers execute in sequence, so the file ended up holding
// whichever adaptation ran last — in the reported case omp's, the least adapted
// of the three, silently replacing codex's verified rewrites.
//
// Order is the wrong thing for that to depend on, and no single provider's
// adaptation is right for the others: codex's body tells cursor to call
// `request_user_input`, which cursor does not have. So a shared path gets
// neither. It gets the neutral body — canonical tool names, neutral `.agents`
// paths — plus one footer naming every provider that reads the file and what
// each has to translate. That content is a pure function of the artifact and
// the set of sharing providers, so it is identical for all of them and the
// conflict stops existing rather than being reported.
//
// The cost is stated plainly: while codex shares this root with another
// provider, its 46 shared files carry canonical tool names instead of Codex
// ones, and the footer is what tells the model to map them. Files codex does
// not share (`.codex/agents/*.toml`, `.codex/commands/*.md`) keep their full
// codex adaptation.
import type { Artifact } from "../kit/kit-types.js";
import type { ProviderId } from "../providers/spec-verified.js";
import { adaptFrontmatterTools, serializeFrontmatter } from "./frontmatter.js";
import { rewritePaths } from "./path-rewrites.js";
import { SHARED_FOOTER_HEADING, sharedFooter } from "./compatibility-footer.js";

/**
 * The provider whose adaptation is neutral by definition: neutral `.agents`
 * path rewrites, identity tool names, no footer of its own. Not a guess at a
 * middle ground — it is the row the table already keeps for "a target that is
 * not a product", which is exactly what a shared file is.
 */
const NEUTRAL: ProviderId = "generic";

/** Neutral adaptation of a frontmatter artifact, plus the multi-provider footer. */
export function adaptShared(artifact: Artifact, providers: readonly ProviderId[]): string {
  const data = adaptFrontmatterTools(artifact.frontmatter, NEUTRAL);
  const body = rewritePaths(artifact.body, NEUTRAL);
  return serializeFrontmatter(data, appendSharedFooter(body, providers, artifact.raw));
}

/** Neutral adaptation of a plain text file (no frontmatter, no footer). */
export function adaptSharedText(text: string): string {
  return rewritePaths(text, NEUTRAL);
}

function appendSharedFooter(body: string, providers: readonly ProviderId[], source: string): string {
  const footer = sharedFooter(providers, source);
  if (footer === null || body.includes(SHARED_FOOTER_HEADING)) return body;
  return `${body}\n\n${footer}`;
}

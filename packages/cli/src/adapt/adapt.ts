import type { ProviderId } from "../providers/spec-verified.js";
import type { Artifact } from "../kit/kit-types.js";
import { rewritePaths } from "./path-rewrites.js";
import { rewriteTools } from "./tool-rewrites.js";
import { adaptFrontmatterTools, serializeFrontmatter } from "./frontmatter.js";
import { appendFooter } from "./compatibility-footer.js";

/**
 * Orchestrate adaptation of a canonical artifact body+frontmatter for a target
 * provider. Pipeline order (fixed):
 *   adaptFrontmatterTools → rewritePaths(body) → rewriteTools(body)
 *   → appendFooter(body, source=original raw) → serializeFrontmatter.
 * Pure: no fs/network.
 */
export function adaptArtifact(artifact: Artifact, provider: ProviderId): string {
  const data = adaptFrontmatterTools(artifact.frontmatter, provider);
  let body = rewritePaths(artifact.body, provider);
  body = rewriteTools(body, provider);
  body = appendFooter(body, provider, artifact.raw);
  return serializeFrontmatter(data, body);
}

import type { Argument, Command, Option } from "commander";
import type { Artifact, Kit } from "../kit/kit-types.js";
import { MATRIX_ARTIFACTS, MATRIX_PROVIDERS, type MatrixData } from "../providers/provider-matrix.js";
import type {
  DocsBundleCommandRecord,
  DocsBundleDigest,
  DocsBundleProofAttestation,
  DocsBundleProofClaim,
  DocsBundleProofInput,
  DocsBundleProofSummary,
  DocsBundleProviderRecord,
  DocsBundleSkillRecord,
  DocsBundleWorkflowRecord,
} from "./docs-bundle-types.js";
import { collectCommandTree, commandPath, sanitizePublicBoolean, sanitizePublicList, sanitizePublicText, sanitizePublicTextValue, sortObject } from "./docs-bundle-projector-helpers.js";
import { projectSkillMetadata } from "./docs-bundle-skill-metadata.js";

const SHA256 = /^sha256:[a-f0-9]{64}$/;
const STATUSES = new Set(["pass", "fail", "incomplete"]);
const PRODUCERS = new Set(["harness", "evaluator"]);
const PROOFS = new Set(["artifact", "decision", "execution", "external-state", "outcome", "source"]);

function defaultValueShape(option: Option): DocsBundleCommandRecord["options"][number]["defaultValueShape"] {
  if (Array.isArray(option.defaultValue)) return "array";
  if (option.defaultValue === null) return "null";
  if (typeof option.defaultValue === "boolean") return "boolean";
  if (typeof option.defaultValue === "number") return "number";
  if (typeof option.defaultValue === "string") return "string";
  return "undefined";
}

function projectOption(option: Option): DocsBundleCommandRecord["options"][number] {
  return {
    flags: sanitizePublicText(option.flags, `option ${option.flags}`),
    description: sanitizePublicText(option.description ?? "", `option ${option.flags} description`),
    required: option.required,
    optionalValue: option.optional,
    variadic: Boolean(option.variadic),
    defaultValueShape: defaultValueShape(option),
  };
}

function projectArgument(argument: Argument): DocsBundleCommandRecord["arguments"][number] {
  const name = argument.name();
  return {
    name: sanitizePublicText(name, `argument ${name}`),
    required: argument.required,
    variadic: Boolean(argument.variadic),
    description: sanitizePublicText(argument.description ?? "", `argument ${name} description`),
  };
}

function projectSkill(artifact: Artifact): DocsBundleSkillRecord {
  const frontmatter = artifact.frontmatter as Record<string, unknown>;
  const skill: DocsBundleSkillRecord = {
    id: sanitizePublicText(artifact.name, `skill ${artifact.name} id`),
    name: sanitizePublicTextValue(frontmatter.name, `skill ${artifact.name} name`) ?? sanitizePublicText(artifact.name, `skill ${artifact.name} fallback name`),
    description: sanitizePublicTextValue(frontmatter.description, `skill ${artifact.name} description`) ?? "",
    metadata: projectSkillMetadata(frontmatter.metadata, `skill ${artifact.name} metadata`),
  };
  const whenToUse = sanitizePublicTextValue(frontmatter.when_to_use, `skill ${artifact.name} when_to_use`);
  const category = sanitizePublicTextValue(frontmatter.category, `skill ${artifact.name} category`);
  const argumentHint = sanitizePublicTextValue(frontmatter.argumentHint, `skill ${artifact.name} argumentHint`)
    ?? sanitizePublicTextValue(frontmatter["argument-hint"], `skill ${artifact.name} argument-hint`);
  const userInvocable = sanitizePublicBoolean(frontmatter.userInvocable) ?? sanitizePublicBoolean(frontmatter["user-invocable"]);
  if (whenToUse) skill.whenToUse = whenToUse;
  if (category) skill.category = category;
  if (argumentHint) skill.argumentHint = argumentHint;
  if (userInvocable !== undefined) skill.userInvocable = userInvocable;
  if (Array.isArray(frontmatter.keywords)) {
    skill.keywords = sanitizePublicList(
      frontmatter.keywords.filter((item): item is string => typeof item === "string"),
      `skill ${artifact.name} keywords`,
    );
  }
  return sortObject(skill);
}

function validateDigest(label: string, digest: unknown): DocsBundleDigest {
  if (typeof digest !== "string" || !SHA256.test(digest)) throw new Error(`${label} must be a sha256 digest`);
  return digest as DocsBundleDigest;
}

function validateClaim(value: unknown): DocsBundleProofClaim {
  if (!value || typeof value !== "object") throw new Error("proof claim is invalid");
  const claim = value as Record<string, unknown>;
  if (typeof claim.id !== "string" || typeof claim.summary !== "string" || typeof claim.status !== "string") throw new Error("proof claim is invalid");
  if (!STATUSES.has(claim.status)) throw new Error(`unsupported proof claim status: ${claim.status}`);
  return {
    id: sanitizePublicText(claim.id, `proof claim ${claim.id}`),
    status: claim.status as DocsBundleProofClaim["status"],
    summary: sanitizePublicText(claim.summary, `proof claim ${claim.id} summary`),
  };
}

function validateAttestation(value: unknown): DocsBundleProofAttestation {
  if (!value || typeof value !== "object") throw new Error("proof attestation is invalid");
  const entry = value as Record<string, unknown>;
  if (typeof entry.id !== "string" || typeof entry.producer !== "string" || typeof entry.proof !== "string" || typeof entry.status !== "string") {
    throw new Error("proof attestation is invalid");
  }
  if (!PRODUCERS.has(entry.producer)) throw new Error(`unsupported proof producer: ${entry.producer}`);
  if (!PROOFS.has(entry.proof)) throw new Error(`unsupported proof kind: ${entry.proof}`);
  if (!STATUSES.has(entry.status)) throw new Error(`unsupported proof attestation status: ${entry.status}`);
  return {
    id: sanitizePublicText(entry.id, `proof attestation ${entry.id}`),
    producer: entry.producer as DocsBundleProofAttestation["producer"],
    proof: entry.proof as DocsBundleProofAttestation["proof"],
    status: entry.status as DocsBundleProofAttestation["status"],
  };
}

export function projectCli(program: Command): { commands: DocsBundleCommandRecord[] } {
  return {
    commands: collectCommandTree(program).map((command) => ({
      path: commandPath(program, command),
      aliases: sanitizePublicList([...command.aliases()], `command ${command.name()} aliases`),
      description: sanitizePublicText(command.description(), `command ${command.name()} description`),
      arguments: command.registeredArguments.map(projectArgument).sort((left, right) => left.name.localeCompare(right.name)),
      options: command.options.map(projectOption).sort((left, right) => left.flags.localeCompare(right.flags)),
    })).sort((left, right) => left.path.localeCompare(right.path)),
  };
}

export function projectKit(kit: Kit): { skills: DocsBundleSkillRecord[]; workflows: DocsBundleWorkflowRecord[] } {
  return {
    skills: kit.skills.map(projectSkill).sort((left, right) => left.id.localeCompare(right.id)),
    workflows: kit.workflows.map((workflow) => ({
      id: sanitizePublicText(workflow.name, `workflow ${workflow.name} id`),
      title: sanitizePublicText(workflow.graph.title, `workflow ${workflow.name} title`),
      description: sanitizePublicText(workflow.graph.description, `workflow ${workflow.name} description`),
      nodes: workflow.graph.nodes.map((node) => ({
        id: sanitizePublicText(node.id, `workflow ${workflow.name} node ${node.id} id`),
        type: sanitizePublicText(node.type, `workflow ${workflow.name} node ${node.id} type`),
        handler: {
          kind: sanitizePublicText(node.handler.kind, `workflow ${workflow.name} node ${node.id} handler kind`),
          ref: sanitizePublicText(node.handler.ref, `workflow ${workflow.name} node ${node.id} handler ref`),
        },
      })).sort((left, right) => left.id.localeCompare(right.id)),
      edges: workflow.graph.edges.map((edge) => ({
        id: sanitizePublicText(edge.id, `workflow ${workflow.name} edge ${edge.id} id`),
        from: sanitizePublicText(edge.from, `workflow ${workflow.name} edge ${edge.id} from`),
        to: sanitizePublicText(edge.to, `workflow ${workflow.name} edge ${edge.id} to`),
        type: sanitizePublicText(edge.type, `workflow ${workflow.name} edge ${edge.id} type`),
      })).sort((left, right) => left.id.localeCompare(right.id)),
    })).sort((left, right) => left.id.localeCompare(right.id)),
  };
}

export function projectProviders(matrix: MatrixData): { providers: DocsBundleProviderRecord[] } {
  return {
    providers: MATRIX_PROVIDERS.map((id) => ({
      id: sanitizePublicText(id, `provider ${id} id`),
      artifacts: MATRIX_ARTIFACTS.flatMap((artifact) => {
        const cell = matrix[id]?.[artifact];
        return cell?.verified === true && typeof cell.path === "string"
          ? [{ artifact: sanitizePublicText(artifact, `provider ${id} artifact ${artifact}`), verified: true as const, path: sanitizePublicText(cell.path, `provider ${id} artifact ${artifact} path`) }]
          : [];
      }),
    })),
  };
}

export function projectProof(input: DocsBundleProofInput | Record<string, unknown>): DocsBundleProofSummary {
  if (input.schemaVersion !== 1) throw new Error("unsupported proof summary schemaVersion");
  if (typeof input.boundary !== "string" || input.boundary.length === 0) throw new Error("proof boundary is required");
  return {
    schemaVersion: 1,
    boundary: sanitizePublicText(input.boundary, "proof boundary"),
    sourceDigests: Object.fromEntries(
      Object.entries(typeof input.sourceDigests === "object" && input.sourceDigests ? input.sourceDigests : {})
        .map(([key, value]) => [sanitizePublicText(key, `proof source ${key}`), validateDigest(`proof source ${key}`, value)])
        .sort(([left], [right]) => left.localeCompare(right)),
    ) as DocsBundleProofSummary["sourceDigests"],
    claims: (Array.isArray(input.claims) ? input.claims : []).map(validateClaim).sort((left, right) => left.id.localeCompare(right.id)),
    attestations: (Array.isArray(input.attestations) ? input.attestations : []).map(validateAttestation).sort((left, right) => left.id.localeCompare(right.id)),
  };
}

export function normalizeReleaseNotes(input: { version: string; changelog: string; workspaceRoot: string }): string {
  const normalized = input.changelog.replace(/\r\n/g, "\n");
  const heading = `## ${input.version}`;
  const start = normalized.indexOf(heading);
  if (start === -1) throw new Error(`release notes not found for ${input.version}`);
  const nextSection = normalized.slice(start).indexOf("\n## ", heading.length);
  const selected = `${(nextSection === -1 ? normalized.slice(start) : normalized.slice(start, start + nextSection)).trimEnd()}\n`;
  const safe = sanitizePublicText(selected, `release notes for ${input.version}`);
  if (safe.includes(input.workspaceRoot)) throw new Error("release notes contain workspace path content");
  return safe;
}

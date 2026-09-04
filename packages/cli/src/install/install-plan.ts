import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import type { Kit } from "../kit/kit-types.js";
import type { ProviderResolver, ResolverCtx } from "../providers/resolver.js";
import { mapCommand } from "../adapt/command-map.js";
import { OUTPUT_STYLES_SIDECAR_SUBDIR } from "../adapt/paths.js";
import { buildRulesBlock } from "./agents-md.js";
import type { HookBinding } from "./hook-settings-merge.js";
import { compareBindings, hookBindingSpecs } from "../kit/hook-bindings.js";
import type { HookBindingSpec } from "../kit/kit-types.js";
import { agentContent, adaptText, skillFiles } from "./artifact-content.js";
import { HOOK_RUNTIME_MARKER_FILE, hookRuntimeMarkerContent, hookRuntimeMarkerPath } from "./hook-runtime-marker.js";
import { IGNORE_DIRS, IGNORE_FILES, isTextFile, type InstallOp } from "./install-types.js";

function skip(kind: InstallOp["kind"], name: string, reason: string): InstallOp {
  return { action: "skip", kind, name, reason };
}

function planSkills(kit: Kit, r: ProviderResolver, ctx: ResolverCtx): InstallOp[] {
  const ops: InstallOp[] = [];
  for (const skill of kit.skills) {
    const dir = r.targetFor(skill, ctx);
    if (!dir) {
      ops.push(skip("skill", skill.name, "unverified"));
      continue;
    }
    for (const f of skillFiles(skill, r.id)) {
      ops.push({ action: "write", kind: "skill", name: skill.name, dest: join(dir, f.rel), content: f.content, mode: f.mode, source: f.source });
    }
  }
  return ops;
}

function planAgents(kit: Kit, r: ProviderResolver, ctx: ResolverCtx): InstallOp[] {
  return kit.agents.map((agent): InstallOp => {
    if (!r.supports.agent) return skip("agent", agent.name, `unsupported/unverified (${r.id})`);
    // The resolver returns the file, shim or not — a plan that appended the
    // filename for one provider by id left every other provider writing a file
    // where that one had made a directory.
    const dest = r.targetFor(agent, ctx)!;
    return { action: "write", kind: "agent", name: agent.name, dest, content: agentContent(agent, r.id), source: { artifact: agent } };
  });
}

function planCommands(kit: Kit, r: ProviderResolver, ctx: ResolverCtx): InstallOp[] {
  return kit.commands.map((cmd): InstallOp => {
    if (!r.supports.command) return skip("command", cmd.name, `unsupported/unverified (${r.id})`);
    return { action: "write", kind: "command", name: cmd.name, dest: r.targetFor(cmd, ctx)!, content: mapCommand(cmd, r.id).content, source: { artifact: cmd } };
  });
}

// Output styles are plain Markdown the provider reads verbatim — no adaptation.
// No provider's native output-style cell is verified today; where hooks are,
// the styles still reach the session as a session-init hook sidecar (see
// planHooks), and the skip reason says so instead of reading as a loss.
function planOutputStyles(kit: Kit, r: ProviderResolver, ctx: ResolverCtx): InstallOp[] {
  return kit.outputStyles.map((style): InstallOp => {
    if (!r.supports.outputStyle) {
      // The sidecar only exists where hooks are actually written, so the
      // consolation half of this message follows `hooksInstall` — a provider
      // whose hook cell is graded but whose tree is not installed gets no
      // sidecar, and must not be told it did.
      const reason = r.hooksInstall
        ? `native surface unverified (${r.id}); installed as session-init hook sidecar instead`
        : `unsupported/unverified (${r.id})`;
      return skip("outputStyle", style.name, reason);
    }
    return { action: "write", kind: "outputStyle", name: style.name, dest: r.targetFor(style, ctx)!, content: style.raw };
  });
}

function planRules(kit: Kit, r: ProviderResolver, ctx: ResolverCtx): InstallOp[] {
  if (kit.rules.length === 0) return [];
  // This gate was missing while every provider happened to have rules
  // verified, so the `!` below asserted away a null that could not yet occur.
  // The moment one provider's rules cell lost its evidence, that null reached
  // the path guard as a crash instead of a skip.
  if (!r.supports.rules) {
    return kit.rules.map((rule) => skip("rules", rule.name, `unsupported/unverified (${r.id})`));
  }
  if (r.rulesMode === "agents-md") {
    const dest = join(r.agentsMdRoot(ctx), "AGENTS.md");
    return [{ action: "agents-md", kind: "rules", name: "AGENTS.md", dest, block: buildRulesBlock(kit.rules) }];
  }
  return kit.rules.map((rule): InstallOp => {
    const dest = r.targetFor(rule, ctx)!;
    return { action: "write", kind: "rules", name: rule.name, dest, content: adaptText(rule.body, r.id), source: { text: rule.body } };
  });
}

function planDirTree(srcDir: string, destDir: string, providerId: ProviderResolver["id"], kind: InstallOp["kind"]): InstallOp[] {
  const ops: InstallOp[] = [];
  const walk = (dir: string, rel: string): void => {
    for (const entry of readdirSync(dir)) {
      if (IGNORE_FILES.has(entry)) continue;
      const abs = join(dir, entry);
      if (statSync(abs).isDirectory()) {
        if (!IGNORE_DIRS.has(entry)) walk(abs, join(rel, entry));
        continue;
      }
      const raw = readFileSync(abs, "utf8");
      const text = isTextFile(entry);
      const content = text ? adaptText(raw, providerId) : raw;
      ops.push({ action: "write", kind, name: entry, dest: join(destDir, rel, entry), content, ...(text ? { source: { text: raw } } : {}) });
    }
  };
  walk(srcDir, "");
  return ops;
}

// Hooks are an event contract, and a provider gets them only when it has been
// given a hooks surface of its own to receive them into. The switch is the
// resolver's `hooksInstall`, not the `hook` evidence cell: grading a cell
// documents that a layout is right, and must not start writing files.
function planHooks(kit: Kit, r: ProviderResolver, ctx: ResolverCtx): InstallOp[] {
  if (kit.hooks.length === 0) return [];
  if (!r.hooksInstall) {
    return kit.hooks.map((h) => skip("hook", h.name, `unsupported/unverified (${r.id})`));
  }
  const hooksDir = r.hooksTarget(ctx);
  const hooksConfig = r.hooksConfigTarget(ctx);
  const ops: InstallOp[] = [];
  // Bindings are collected across every hook first, then ordered: within one
  // event the sequence is a contract (a guardrail before the gate that reads its
  // result), and hook discovery order is alphabetical, which is not it.
  const collected: { spec: HookBindingSpec; name: string; dest: string }[] = [];
  for (const hook of kit.hooks) {
    const dest = join(hooksDir, `${hook.name}.cjs`);
    ops.push({
      action: "write",
      kind: "hook",
      name: hook.name,
      dest,
      content: readFileSync(hook.file, "utf8"),
    });
    for (const spec of hookBindingSpecs(hook.manifest)) {
      collected.push({ spec, name: hook.name, dest });
    }
  }
  collected.sort(compareBindings);
  const bindings: HookBinding[] = collected.map(({ spec, dest }) => ({
    event: spec.event,
    ...(spec.matcher ? { matcher: spec.matcher } : {}),
    command: [`node ${JSON.stringify(dest)}`, ...(spec.args ?? [])].join(" "),
  }));
  // Shared helpers required by hook bodies at runtime.
  const libDir = join(kit.root, "hooks", "_lib");
  if (existsSync(libDir)) {
    ops.push(...planDirTree(libDir, join(hooksDir, "_lib"), r.id, "hook"));
  }
  // The runtime marker the hook library reads beside `_lib`. It is a planned
  // write like every other owned file so the receipt, backups, and uninstall
  // all cover it. The runtime named is the provider's id: hooks are only
  // verified for Claude Code, and that is the id the hook library accepts.
  ops.push({
    action: "write",
    kind: "hook",
    name: HOOK_RUNTIME_MARKER_FILE,
    dest: hookRuntimeMarkerPath(hooksDir),
    content: hookRuntimeMarkerContent(r.id),
  });
  // Coding-level output styles are consumed by the session-init hook, not by
  // the provider — the (claude-code, outputStyle) cell is unverified, so they
  // do not go through planOutputStyles. They install as a hook sidecar under
  // the second path the hook probes, leaving `.claude/output-styles/` to
  // styles the user authors natively (which then win the probe). Written
  // verbatim: the hook strips the frontmatter itself.
  for (const style of kit.outputStyles) {
    ops.push({
      action: "write",
      kind: "hook",
      name: `${style.name}.md`,
      dest: join(hooksDir, OUTPUT_STYLES_SIDECAR_SUBDIR, `${style.name}.md`),
      content: style.raw,
    });
  }
  // The statusline is not a hook — it is a command the provider runs to draw a
  // bar — but it lives in the same owned directory and loads the same `_lib`,
  // so it is written here rather than through a parallel tree of its own.
  if (kit.statusline) {
    if (!r.supports.statusline) {
      ops.push(skip("statusline", "av-statusline.cjs", `unsupported/unverified (${r.id})`));
    } else {
      const dest = join(hooksDir, "av-statusline.cjs");
      ops.push({
        action: "write",
        kind: "statusline",
        name: "av-statusline.cjs",
        dest,
        content: readFileSync(kit.statusline, "utf8"),
      });
      if (hooksConfig !== null) {
        ops.push({
          action: "statusline-settings",
          kind: "statusline",
          name: basename(hooksConfig),
          dest: hooksConfig,
          command: `node ${JSON.stringify(dest)}`,
          ownedDir: hooksDir,
        });
      }
    }
  }

  // A provider that discovers hooks by directory alone gets its bodies, its
  // `_lib` and its marker, and no settings file it never had.
  if (hooksConfig !== null) {
    ops.push({
      action: "hook-settings",
      kind: "hook",
      name: basename(hooksConfig),
      dest: hooksConfig,
      bindings,
      format: r.hooksConfigFormat!,
    });
  }
  return ops;
}

/** Pure: build the full op plan for one provider. Reads sources, writes nothing. */
export function planInstall(kit: Kit, r: ProviderResolver, ctx: ResolverCtx): InstallOp[] {
  const ops: InstallOp[] = [
    ...planSkills(kit, r, ctx),
    ...planAgents(kit, r, ctx),
    ...planCommands(kit, r, ctx),
    ...planOutputStyles(kit, r, ctx),
    ...planRules(kit, r, ctx),
    ...planHooks(kit, r, ctx),
  ];
  if (kit.scriptsDir && r.supports.scripts) {
    ops.push(...planDirTree(kit.scriptsDir, r.scriptsTarget(ctx), r.id, "scripts"));
  }
  if (kit.envExample && r.supports.env) {
    ops.push({ action: "write", kind: "env", name: ".env.example", dest: r.envTarget(ctx), content: readFileSync(kit.envExample, "utf8") });
  }
  return ops;
}

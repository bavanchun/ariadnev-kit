// One reading of a hook manifest's event bindings, shared by the loader (which
// validates them) and the installer (which orders them). Two readings would let
// a manifest validate one way and install another.

import type { HookBindingSpec, HookManifest } from "./kit-types.js";

/** Normalize any manifest form to the explicit binding list. */
export function hookBindingSpecs(manifest: HookManifest): HookBindingSpec[] {
  if (manifest.bindings && manifest.bindings.length > 0) return manifest.bindings;
  const events = manifest.event ? [manifest.event] : (manifest.events ?? []);
  return events.map((event) => ({
    event,
    ...(manifest.matcher ? { matcher: manifest.matcher } : {}),
  }));
}

/**
 * Sort key for one binding. A declared order wins; an undeclared one binds after
 * every declared binding, and ties break on the hook name so the plan is the
 * same on every filesystem rather than however readdir happened to answer.
 */
export function bindingSortKey(spec: HookBindingSpec, hookName: string): [number, string] {
  return [spec.order ?? Number.POSITIVE_INFINITY, hookName];
}

export function compareBindings(
  a: { spec: HookBindingSpec; name: string },
  b: { spec: HookBindingSpec; name: string },
): number {
  const [ao, an] = bindingSortKey(a.spec, a.name);
  const [bo, bn] = bindingSortKey(b.spec, b.name);
  if (ao !== bo) return ao - bo;
  return an < bn ? -1 : an > bn ? 1 : 0;
}

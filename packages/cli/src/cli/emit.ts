// The single stdout/stderr boundary for command output. Every command prints
// through here instead of calling console.* directly, so a cross-cutting concern
// (Phase 3: credential redaction) attaches in exactly ONE place. Defaults to a
// no-op transform; the entrypoint registers the sanitizer via setEmitTransform.

type Transform = (s: string) => string;

const identity: Transform = (s) => s;
let transform: Transform = identity;

export function setEmitTransform(fn: Transform): void {
  transform = fn;
}

export function resetEmitTransform(): void {
  transform = identity;
}

export function emit(line: string): void {
  console.log(transform(line));
}

export function emitError(line: string): void {
  console.error(transform(line));
}

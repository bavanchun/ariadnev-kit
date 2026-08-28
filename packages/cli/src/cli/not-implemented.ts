// A command that exists and answers "not implemented" is worse than an absent
// one: it converts a known gap into a support ticket, and it makes the parity
// ratchet count a name that does nothing.
//
// This type exists so that stubbing is a visible act rather than an accidental
// one. `no-stubs.test.ts` fails on any use of it outside this module, so
// reaching for it is a decision someone has to defend in review — which is the
// only enforcement that survives contact with a deadline.

/** Thrown by a command surface that was registered before it worked. */
export class NotImplementedError extends Error {
  readonly exitCode = 3;

  constructor(command: string) {
    super(`av ${command} is registered but not implemented`);
    this.name = "NotImplementedError";
  }
}

/** An action that refuses. Registering one is what the no-stubs gate forbids. */
export function notImplemented(command: string): () => never {
  return () => {
    throw new NotImplementedError(command);
  };
}

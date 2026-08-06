import type { EventInput, HistoryKind } from "../history/record.js";

export interface GlobalOpts {
  home: string;
  cwd: string;
  dryRun?: boolean;
  yes?: boolean;
}

export interface CommandRegistrationContext {
  version: string;
  outColor(): boolean;
  record(kind: HistoryKind, fields: EventInput): void;
}

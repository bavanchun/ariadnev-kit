export interface VerifiedConsumerOutput {
  path: string;
  kind: "file" | "tree";
  digest: `sha256:${string}`;
}

export interface VerifiedConsumerResult {
  schemaVersion: 1;
  status: "pass";
  repository: string;
  commitSha: string;
  contractDigest: `sha256:${string}`;
  invocationDigest: `sha256:${string}`;
  reportDigest: `sha256:${string}`;
  outputDigest: `sha256:${string}`;
  outputs: VerifiedConsumerOutput[];
  resultDigest: `sha256:${string}`;
}

export function sha256File(path: string): `sha256:${string}`;

export interface WebConsumerLockInput {
  lockPath: string;
  schemaPath: string;
  repositoryRoot: string;
  sourceTreeRoot?: string;
  expectedRepository?: string;
}

export interface WebConsumerLockPreflight {
  repository: string;
  commitSha: string;
  lockDigest: `sha256:${string}`;
}

export function preflightWebConsumerLock(input: WebConsumerLockInput): WebConsumerLockPreflight;

export function verifyWebConsumerLock(input: WebConsumerLockInput): VerifiedConsumerResult;

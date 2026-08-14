const TOKEN_PATTERN = /^[a-z0-9][a-z0-9:._-]{0,127}$/;
const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/;
const SECRET_SHAPES = [
  /^(?:sk|pk)_(?:live|test)_[a-z0-9_]+$/,
  /^gh[pousr]_[a-z0-9_]+$/,
  /^xox[baprs]-[a-z0-9-]+$/,
  /^akia[a-z0-9]{8,}$/,
  /^eyj[a-z0-9_-]+\.[a-z0-9_-]+\.[a-z0-9_-]+$/,
  /^(?:bearer|basic)[.:_-][a-z0-9._-]+$/,
  /^(?:password|passwd)[.:_-][a-z0-9._-]{8,}$/,
];

export function categoricalToken(value: unknown, label: string): string {
  if (typeof value !== "string" || !TOKEN_PATTERN.test(value)) {
    throw new Error(`${label} must be a categorical identifier`);
  }
  const opaqueSegment = value.split(/[.:_-]/).some((segment) => /^[a-z0-9]{25,}$/.test(segment));
  if (opaqueSegment || SECRET_SHAPES.some((pattern) => pattern.test(value))) {
    throw new Error(`${label} resembles sensitive content`);
  }
  return value;
}

export function sha256Digest(value: unknown, label: string): string {
  if (typeof value !== "string" || !DIGEST_PATTERN.test(value)) {
    throw new Error(`${label} must be a sha256 digest`);
  }
  return value;
}

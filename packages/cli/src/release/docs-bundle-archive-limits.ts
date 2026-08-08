export type ArchiveLimits = Readonly<{
  maxFiles: number;
  maxBytesPerFile: number;
  maxTotalBytes: number;
}>;

export const DEFAULT_ARCHIVE_LIMITS: ArchiveLimits = Object.freeze({
  maxFiles: 128,
  maxBytesPerFile: 512 * 1024,
  maxTotalBytes: 4 * 1024 * 1024,
});

const HARD_ARCHIVE_LIMITS: ArchiveLimits = Object.freeze({
  maxFiles: 4096,
  maxBytesPerFile: 64 * 1024 * 1024,
  maxTotalBytes: 256 * 1024 * 1024,
});

export function validateArchiveLimits(input: Partial<ArchiveLimits> = {}): ArchiveLimits {
  const maxTotalBytes = input.maxTotalBytes ?? DEFAULT_ARCHIVE_LIMITS.maxTotalBytes;
  const limits = {
    maxFiles: input.maxFiles ?? DEFAULT_ARCHIVE_LIMITS.maxFiles,
    maxBytesPerFile: input.maxBytesPerFile ?? Math.min(DEFAULT_ARCHIVE_LIMITS.maxBytesPerFile, maxTotalBytes),
    maxTotalBytes,
  };
  for (const key of Object.keys(limits) as Array<keyof ArchiveLimits>) {
    const value = limits[key];
    if (!Number.isSafeInteger(value) || value <= 0 || value > HARD_ARCHIVE_LIMITS[key]) {
      throw new Error(`${key} must be a positive safe integer no greater than ${HARD_ARCHIVE_LIMITS[key]}`);
    }
  }
  if (limits.maxBytesPerFile > limits.maxTotalBytes) {
    throw new Error("maxBytesPerFile must not exceed maxTotalBytes");
  }
  return Object.freeze(limits);
}

export function maximumTarBytes(limits: ArchiveLimits): number {
  return limits.maxTotalBytes + (limits.maxFiles * 1024) + 1024;
}

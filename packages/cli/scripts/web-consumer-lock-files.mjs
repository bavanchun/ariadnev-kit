import { createHash } from "node:crypto";
import {
  closeSync, constants, fstatSync, lstatSync, openSync, readFileSync, readdirSync, realpathSync,
} from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";

export const MAX_CONSUMER_FILE_BYTES = 8 * 1024 * 1024;
export const MAX_CONSUMER_TREE_BYTES = 64 * 1024 * 1024;
export const MAX_CONSUMER_TREE_FILES = 2048;
const MAX_CONSUMER_TREE_DEPTH = 32;

export function sha256Bytes(content) {
  return `sha256:${createHash("sha256").update(content).digest("hex")}`;
}

export function inside(root, candidate) {
  const offset = relative(root, candidate);
  return offset === "" || (!offset.startsWith(`..${sep}`) && offset !== ".." && !isAbsolute(offset));
}

export function safeReal(root, relativePath, label) {
  if (isAbsolute(relativePath)) throw new Error(`${label} must stay inside the checked-out tree`);
  const unresolved = resolve(root, relativePath);
  if (!inside(root, unresolved)) throw new Error(`${label} escapes the checked-out tree`);
  let real;
  try { real = realpathSync(unresolved); } catch { throw new Error(`${label} was not found`); }
  if (!inside(root, real)) throw new Error(`${label} resolves outside the checked-out tree`);
  return real;
}

export function pathInsideRoot(root, candidatePath, label) {
  let real;
  try { real = realpathSync(candidatePath); } catch { throw new Error(`${label} was not found`); }
  if (!inside(root, real)) throw new Error(`${label} must be stored inside the exact source tree`);
  return real;
}

export function readRegularFile(root, relativePath, label, maxBytes = MAX_CONSUMER_FILE_BYTES) {
  const real = safeReal(root, relativePath, label);
  const fd = openSync(real, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile()) throw new Error(`${label} must be a regular file`);
    if (stat.size > maxBytes) throw new Error(`${label} exceeds ${maxBytes} bytes`);
    return readFileSync(fd);
  } finally {
    closeSync(fd);
  }
}

export function readSourceFile(root, candidatePath, label, maxBytes = MAX_CONSUMER_FILE_BYTES) {
  const real = pathInsideRoot(root, candidatePath, label);
  const relativePath = relative(root, real);
  return readRegularFile(root, relativePath, label, maxBytes);
}

export function listTree(root, relativePath, label) {
  const real = safeReal(root, relativePath, label);
  const stat = lstatSync(real);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`${label} must be a real directory`);
  const files = [];
  let totalBytes = 0;
  const visit = (directory, relativeDirectory, depth) => {
    if (depth > MAX_CONSUMER_TREE_DEPTH) throw new Error(`${label} exceeds the directory depth limit`);
    for (const name of readdirSync(directory).sort((left, right) => left.localeCompare(right))) {
      const nextReal = resolve(directory, name);
      const nextRelative = relativeDirectory ? `${relativeDirectory}/${name}` : name;
      const nextStat = lstatSync(nextReal);
      if (nextStat.isSymbolicLink()) throw new Error(`${label} must not contain symbolic links`);
      if (nextStat.isDirectory()) visit(nextReal, nextRelative, depth + 1);
      else if (nextStat.isFile()) {
        if (nextStat.size > MAX_CONSUMER_FILE_BYTES) throw new Error(`${label} contains an oversized file`);
        totalBytes += nextStat.size;
        if (totalBytes > MAX_CONSUMER_TREE_BYTES) throw new Error(`${label} exceeds the tree byte limit`);
        if (files.length + 1 > MAX_CONSUMER_TREE_FILES) throw new Error(`${label} exceeds the tree file limit`);
        files.push({ path: nextRelative, digest: sha256Bytes(readFileSync(nextReal)) });
      } else throw new Error(`${label} must contain only regular files`);
    }
  };
  visit(real, "", 0);
  return files;
}

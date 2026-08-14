import { existsSync, lstatSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";

function isInside(root, candidate) {
  const offset = relative(root, candidate);
  return offset === "" || (!offset.startsWith(`..${sep}`) && offset !== ".." && !isAbsolute(offset));
}

export function validateReleaseOutputDirectory(value, defaultOutputDirectory) {
  const outputDirectory = resolve(value);
  const defaultDirectory = resolve(defaultOutputDirectory);
  if (existsSync(outputDirectory) && lstatSync(outputDirectory).isSymbolicLink()) {
    throw new Error("release output directory must not be a symbolic link");
  }
  if (outputDirectory === defaultDirectory) {
    const parent = dirname(defaultDirectory);
    if (existsSync(parent) && lstatSync(parent).isSymbolicLink()) {
      throw new Error("release output parent must not be a symbolic link");
    }
    return outputDirectory;
  }
  if (basename(outputDirectory) !== "release") {
    throw new Error("custom release output must use a release leaf directory");
  }
  const temporaryRoot = realpathSync(tmpdir());
  const parent = realpathSync(dirname(outputDirectory));
  if (!isInside(temporaryRoot, parent)) {
    throw new Error("custom release output must stay inside the system temporary directory");
  }
  return outputDirectory;
}

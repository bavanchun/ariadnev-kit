import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

function loadJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function formatErrors(errors) {
  return (errors ?? []).map((entry) => `${entry.instancePath || "/"} ${entry.message ?? "is invalid"}`).join("; ");
}

export function validateReleaseJson({ schemaPath, jsonPath }) {
  const ajv = new Ajv2020({ allErrors: true, strict: true, strictTuples: false });
  addFormats(ajv);
  const validate = ajv.compile(loadJson(schemaPath));
  const value = loadJson(jsonPath);
  if (!validate(value)) throw new Error(formatErrors(validate.errors));
  return value;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const [schemaPath, jsonPath] = process.argv.slice(2);
    validateReleaseJson({ schemaPath, jsonPath });
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}

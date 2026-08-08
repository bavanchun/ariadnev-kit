const [command, flag] = process.argv.slice(2);
if (command !== "inspect") throw new Error("expected inspect command");
const result = { project: "synthetic-docs-change", status: "ready" };
process.stdout.write(flag === "--json" ? `${JSON.stringify(result)}\n` : `${result.project}: ${result.status}\n`);

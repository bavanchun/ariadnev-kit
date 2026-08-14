export function parseArgs(args) {
  const unknown = args.filter((arg) => arg !== "--verbose");
  if (unknown.length > 0) throw new Error(`unknown option: ${unknown[0]}`);
  return { verbose: args.includes("--verbose") };
}

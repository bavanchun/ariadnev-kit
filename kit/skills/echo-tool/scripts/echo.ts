#!/usr/bin/env node
// Sample skill-local script. Echoes CLI args back to stdout.
const args = process.argv.slice(2);
process.stdout.write(args.join(" ") + "\n");

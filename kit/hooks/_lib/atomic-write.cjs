// Temp+rename write so concurrent readers never observe a half-written file.
const fs = require("node:fs");
const path = require("node:path");

function atomicWrite(dest, content) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const tmp = `${dest}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, content, "utf8");
  fs.renameSync(tmp, dest);
}

module.exports = { atomicWrite };

# Accepted parser change

Add `--json` support to `parseArgs`. It must compose with `--verbose`, reject
unknown options, preserve the existing return shape plus a `json` boolean, and
include focused tests before implementation. No new dependency is permitted.

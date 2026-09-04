#!/usr/bin/env bash
# Advisory validator pass over one rendered diagram.
#
# Ours, not upstream's: the pinned diagram-design commit contains no shell script
# at all, so this file carries no third-party attribution. The three Python
# validators beside it are vendored and MIT-licensed — see ../../LICENSE and
# ../../references/vendoring-metadata.yaml.
#
# Advisory means advisory. Every validator's verdict is reported and none of them
# is allowed to fail the run, because a checker that blocks delivery turns an
# opinion about a diagram into an outage. Two of the three routinely disagree
# with a perfectly good artefact: verify-motion.py applies only to diagrams that
# carry motion markup and reports every static one, and the validators resolve
# their own default asset directory against the upstream repository layout, which
# does not exist inside this skill — so pass explicit paths and read the output
# as advice.

set -uo pipefail

readonly here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ $# -lt 1 ]]; then
  echo "usage: run-validators.sh <rendered-diagram.html>" >&2
  exit 2
fi

readonly artifact="$1"

if ! command -v python3 >/dev/null 2>&1; then
  echo "run-validators: python3 not found — skipping the validator pass" >&2
  exit 0
fi

for validator in self_check.py verify-geometry.py verify-motion.py; do
  script="$here/$validator"
  [[ -f "$script" ]] || continue
  if ! python3 "$script" "$artifact"; then
    echo "run-validators: $validator reported findings on $artifact (advisory)" >&2
  fi
done

exit 0

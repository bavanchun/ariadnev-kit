#!/usr/bin/env python3
"""av:diagram vendor — copy editorial templates from cathrynlavery/diagram-design (MIT).

Reads a shallow-cloned upstream checkout, filters to selected diagram types,
strips CDN references, wraps each HTML in a lightweight metadata frontmatter
comment, and writes to assets/templates/<type>/<variant>.html.

Also emits references/vendoring-metadata.yaml with upstream SHA + license + timestamps
so re-vendoring is idempotent and provenance is auditable.

--sha is required and is the revision that gets vendored: the source checkout is
moved to it before a single file is read, and a HEAD that disagrees afterwards
aborts the run. A clone of the default branch is not a pin — the recorded hashes
would faithfully describe content nobody chose.

Usage:
    # Clone upstream, then vendor a named revision
    git clone https://github.com/cathrynlavery/diagram-design.git /tmp/dd-src
    python3 scripts/vendor_from_upstream.py --source /tmp/dd-src --sha <full-40-char-sha>

    # Dry run — show what would change
    python3 scripts/vendor_from_upstream.py --source /tmp/dd-src --sha <sha> --dry-run

    # Restrict to specific types (default: all base 24)
    python3 scripts/vendor_from_upstream.py --source /tmp/dd-src --sha <sha> --types architecture,loop
"""

from __future__ import annotations

import argparse
import hashlib
import re
import subprocess
import sys
from pathlib import Path

SKILL_ROOT = Path(__file__).resolve().parent.parent
TEMPLATES_DIR = SKILL_ROOT / "assets" / "templates"
VALIDATORS_DIR = SKILL_ROOT / "scripts" / "validators"
METADATA_FILE = SKILL_ROOT / "references" / "vendoring-metadata.yaml"

# The geometry/motion validators, which live in two different upstream
# directories — hence a path per file rather than one shared prefix.
#
# They are copied byte-for-byte: a Python file cannot carry the HTML comment
# header the templates get, and copying verbatim makes the recorded hash the
# upstream file's own hash rather than a hash of our wrapping. run-validators.sh
# is deliberately absent from this list — the pinned commit contains no shell
# script at all, so ours is written by hand and carries no upstream attribution.
VALIDATORS = [
    "scripts/verify-geometry.py",
    "scripts/verify-motion.py",
    "skills/diagram-design/scripts/self_check.py",
]

# 24 base types across 4 clusters — the locked set this skill ships templates for.
DEFAULT_TYPES = [
    # Architecture cluster (7)
    "architecture", "high-level", "layers", "medallion",
    "dp-integration", "dp-security-matrix", "data-flow",
    # Flow & process cluster (6)
    "flowchart", "sequence", "state", "swimlane", "process", "org-chart",
    # Storytelling cluster (7)
    "loop", "pyramid", "quadrant", "radar", "timeline", "nested", "it-state",
    # Data viz cluster (4)
    "bar", "line", "scatter", "gantt",
]

VARIANTS = {
    "light": "",           # example-<type>.html
    "dark": "-dark",       # example-<type>-dark.html
    "full": "-full",       # example-<type>-full.html
}

# Strip patterns — CDN scripts and analytics that break determinism
STRIP_PATTERNS = [
    re.compile(r'<script[^>]+src="https://[^"]+"[^>]*></script>', re.IGNORECASE),
    re.compile(r'<link[^>]+href="https://fonts\.[^"]+"[^>]*>', re.IGNORECASE),
    re.compile(r'<script[^>]+src="https://www\.googletagmanager[^"]+"[^>]*></script>', re.IGNORECASE),
]


def _read_upstream_sha(source: Path) -> str:
    try:
        return subprocess.check_output(
            ["git", "-C", str(source), "rev-parse", "HEAD"],
            text=True,
        ).strip()
    except (subprocess.CalledProcessError, FileNotFoundError):
        return "unknown"


def _checkout(source: Path, sha: str) -> None:
    """Move the source checkout onto the requested revision, then prove it moved.

    A shallow clone usually lacks the object, so a failed checkout is followed by
    one fetch of that exact revision. The verification afterwards is the point:
    "unknown" is a mismatch, not a pass, because a rev-parse we could not read is
    indistinguishable from one that disagrees.
    """
    def checkout() -> bool:
        return subprocess.run(
            ["git", "-C", str(source), "checkout", "--detach", sha],
            capture_output=True,
        ).returncode == 0

    if not checkout():
        subprocess.run(
            ["git", "-C", str(source), "fetch", "--depth", "1", "origin", sha],
            capture_output=True,
        )
        checkout()

    actual = _read_upstream_sha(source)
    if actual != sha:
        raise SystemExit(
            f"upstream checkout is at {actual}, not the requested {sha} — refusing to vendor"
        )


def _commit_date(source: Path, sha: str) -> str:
    """The pinned commit's committer date, used wherever a timestamp is stamped.

    Wall-clock stamps made every re-run rewrite all 72 templates and all 72
    hashes, so a four-file change arrived as a 72-file diff. Deriving from the
    commit makes the output a pure function of (sha, target set): re-vendoring
    the same revision is an empty diff, and a non-empty one is a real change.
    """
    try:
        return subprocess.check_output(
            ["git", "-C", str(source), "show", "-s", "--format=%cI", sha],
            text=True,
        ).strip()
    except (subprocess.CalledProcessError, FileNotFoundError) as exc:
        raise SystemExit(f"cannot read the committer date of {sha}: {exc}")


def _sanitize(html: str) -> str:
    out = html
    for pattern in STRIP_PATTERNS:
        out = pattern.sub("", out)
    return out


def _wrap_with_metadata(html: str, source_rel: str, upstream_sha: str, stamp: str) -> str:
    header = (
        f"<!--\n"
        f"  av:diagram vendored template\n"
        f"  upstream: cathrynlavery/diagram-design (MIT)\n"
        f"  source_path: skills/diagram-design/assets/{source_rel}\n"
        f"  upstream_sha: {upstream_sha}\n"
        f"  imported_at: {stamp}\n"
        f"  license: MIT (see references/vendoring-metadata.yaml)\n"
        f"-->\n"
    )
    return header + html


def _digest(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:12]


def vendor(
    source: Path,
    sha: str,
    types: list[str],
    dry_run: bool = False,
) -> dict:
    _checkout(source, sha)
    stamp = _commit_date(source, sha)

    upstream_assets = source / "skills" / "diagram-design" / "assets"
    if not upstream_assets.is_dir():
        raise SystemExit(f"upstream assets not found: {upstream_assets}")

    stats = {"created": 0, "updated": 0, "skipped": 0, "missing": []}
    manifest = []

    for dtype in types:
        target_dir = TEMPLATES_DIR / dtype
        if not dry_run:
            target_dir.mkdir(parents=True, exist_ok=True)

        for variant, suffix in VARIANTS.items():
            source_name = f"example-{dtype}{suffix}.html"
            source_path = upstream_assets / source_name
            if not source_path.exists():
                stats["missing"].append(f"{dtype}/{variant}")
                continue

            raw = source_path.read_text(encoding="utf-8")
            sanitized = _sanitize(raw)
            wrapped = _wrap_with_metadata(sanitized, source_name, sha, stamp)

            target = target_dir / f"{variant}.html"
            existed = target.exists()
            if existed and target.read_text(encoding="utf-8") == wrapped:
                stats["skipped"] += 1
            elif dry_run:
                stats["updated" if existed else "created"] += 1
            else:
                target.write_text(wrapped, encoding="utf-8")
                stats["updated" if existed else "created"] += 1

            manifest.append({
                "type": dtype,
                "variant": variant,
                "source": source_name,
                "target": str(target.relative_to(SKILL_ROOT)),
                "sha256_12": _digest(wrapped),
            })

    validators = _vendor_validators(source, stats, dry_run)

    if not dry_run:
        _write_metadata(manifest, validators, sha, stamp)

    return stats


def _vendor_validators(source: Path, stats: dict, dry_run: bool) -> list[dict]:
    """Copy the geometry/motion validators verbatim, and report what they hash to.

    Byte-for-byte, unlike the templates: these are executable Python, so there is
    no comment header to wrap them in that would not also change what runs. The
    upshot is that the recorded hash is the upstream file's own, which is a
    stronger provenance claim than a hash of our wrapping would be.
    """
    if not dry_run:
        VALIDATORS_DIR.mkdir(parents=True, exist_ok=True)

    entries = []
    for upstream_path in VALIDATORS:
        source_path = source / upstream_path
        if not source_path.exists():
            stats["missing"].append(upstream_path)
            continue

        text = source_path.read_text(encoding="utf-8")
        target = VALIDATORS_DIR / Path(upstream_path).name
        existed = target.exists()
        if existed and target.read_text(encoding="utf-8") == text:
            stats["skipped"] += 1
        elif dry_run:
            stats["updated" if existed else "created"] += 1
        else:
            target.write_text(text, encoding="utf-8")
            target.chmod(0o755)
            stats["updated" if existed else "created"] += 1

        entries.append({
            "upstream_path": upstream_path,
            "target": str(target.relative_to(SKILL_ROOT)),
            "sha256_12": _digest(text),
        })
    return entries


# Everything this script does not own in vendoring-metadata.yaml. `extra_vendors:`
# is hand-maintained and is the only provenance for assets/mermaid.min.js, so a
# writer that rebuilds the file from a fixed header erases a third-party bundle's
# entire audit trail — the exact failure the validators are being vendored to
# avoid. Any block that is not one this script generates is carried through
# verbatim, in place.
_GENERATED_KEYS = ("upstream_repo", "upstream_license", "upstream_sha", "vendored_at",
                   "template_count", "validator_count")


def _preserved_blocks(existing: str) -> str:
    """The parts of an existing metadata file this script did not write."""
    kept = []
    for block in existing.split("\n\n"):
        stripped = block.strip()
        if not stripped:
            continue
        if stripped.startswith("templates:") or stripped.startswith("validators:"):
            continue
        # The generated header, including its leading comment lines.
        body = [ln for ln in stripped.splitlines() if not ln.lstrip().startswith("#")]
        if body and all(ln.split(":", 1)[0].strip() in _GENERATED_KEYS for ln in body if ":" in ln):
            continue
        kept.append(stripped)
    return "\n\n".join(kept)


def _write_metadata(manifest: list[dict], validators: list[dict], upstream_sha: str, stamp: str) -> None:
    METADATA_FILE.parent.mkdir(parents=True, exist_ok=True)
    preserved = ""
    if METADATA_FILE.exists():
        preserved = _preserved_blocks(METADATA_FILE.read_text(encoding="utf-8"))

    header = [
        "# av:diagram vendoring metadata — do not edit by hand.",
        "# Regenerated by scripts/vendor_from_upstream.py.",
        "upstream_repo: cathrynlavery/diagram-design",
        "upstream_license: MIT",
        f"upstream_sha: {upstream_sha}",
        f"vendored_at: {stamp}",
        f"template_count: {len(manifest)}",
        f"validator_count: {len(validators)}",
    ]
    sections = ["\n".join(header)]
    if preserved:
        sections.append(preserved)

    validator_lines = ["validators:"]
    for entry in validators:
        validator_lines.append(
            f"  - upstream_path: {entry['upstream_path']}\n"
            f"    target: {entry['target']}\n"
            f"    sha256_12: {entry['sha256_12']}"
        )
    sections.append("\n".join(validator_lines))

    template_lines = ["templates:"]
    for entry in manifest:
        template_lines.append(
            f"  - type: {entry['type']}\n"
            f"    variant: {entry['variant']}\n"
            f"    source: {entry['source']}\n"
            f"    target: {entry['target']}\n"
            f"    sha256_12: {entry['sha256_12']}"
        )
    sections.append("\n".join(template_lines))

    METADATA_FILE.write_text("\n\n".join(sections) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Vendor templates from diagram-design upstream")
    parser.add_argument("--source", type=Path, required=True, help="Path to cloned upstream repo")
    parser.add_argument(
        "--sha",
        type=str,
        required=True,
        help="Upstream revision to vendor — the source is checked out to it and verified",
    )
    parser.add_argument(
        "--types",
        type=str,
        default=",".join(DEFAULT_TYPES),
        help="Comma-separated diagram type slugs (default: 24 locked)",
    )
    parser.add_argument("--dry-run", action="store_true", help="Report without writing")
    args = parser.parse_args()

    types = [t.strip() for t in args.types.split(",") if t.strip()]
    stats = vendor(args.source, args.sha, types, dry_run=args.dry_run)

    print(f"vendor: created={stats['created']} updated={stats['updated']} skipped={stats['skipped']}")
    if stats["missing"]:
        print(f"missing upstream variants ({len(stats['missing'])}):")
        for m in stats["missing"]:
            print(f"  - {m}")
    if args.dry_run:
        print("(dry run — no files written)")
    return 0


if __name__ == "__main__":
    sys.exit(main())

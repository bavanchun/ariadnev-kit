# Ultra Verifier Mode (`--ultra`)

When `--ultra` is present, run the **initial review of the PR** as a best-of-5
verifier pass. The controller assembles one immutable evidence packet — the
diff, PR body, linked issue, and CI status — plus the review rubric (the
Correctness / Security / Breaking changes / Code quality / Project-specific
compliance / Testing checks in `SKILL.md` step 3), dispatches exactly five
independent read-only candidate reviews in one parallel wave, then a single
strongest-model verifier validates the findings.

- **Candidate task:** each candidate performs the full review of the same PR
  evidence packet and returns its findings list with severities and cited
  evidence. Candidates never comment, commit, or call `gh` mutations.
- **Finalizer:** the verifier returns the evidence-validated, deduplicated union
  of findings across the five reviews — it never selects one review wholesale,
  because a real defect may appear in only one candidate. It drops findings it
  cannot validate against cited evidence and merges duplicates; ranking orders
  severity and confidence only.
- The fix/reply/merge flow then runs once on that union; re-reviews in the fix
  loop stay single-pass, so the `--fix` re-invocation never carries `--ultra`
  forward.

The union keeps the severity rule from `SKILL.md` step 4 (structural slop →
Important, micro slop → Suggestion) and is written in the review block under
Output format; the run report gains one line, `Ultra: 5 candidates verified ·
findings validated <n> / dropped <m>`.

Full mechanics — anonymization, the five-usable-candidate gate with one bounded
re-dispatch, reject-all, and the fail-closed runtime rule — are in
`../../av-brainstorm/references/ultra-verifier-mode.md`. It is a best-of-5
verifier mode inspired by LLM-as-a-Verifier, not the full framework; never
claim its logprob/tournament algorithm.

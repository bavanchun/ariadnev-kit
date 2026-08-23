# Anti-Rationalization

The shortcuts an agent reaches for when it wants to patch a symptom instead of
proving the cause, and why each one is wrong. Read when you notice yourself
about to edit code before Steps 1-2 (Scout + Diagnose) are complete.

| Thought | Reality |
|---------|---------|
| "I can see the problem, let me fix it" | Seeing symptoms ≠ understanding root cause. Scout first. |
| "Quick fix for now, investigate later" | "Later" never comes. Fix properly now. |
| "Just try changing X" | Random fixes waste time and create new bugs. Diagnose first. |
| "It's probably X" | "Probably" = guessing. Use structured diagnosis. Verify first. |
| "One more fix attempt" (after 2+) | 3+ failures = wrong approach. Question architecture. |
| "Emergency, no time for process" | Systematic diagnosis is FASTER than guess-and-check. |
| "I already know the codebase" | Knowledge decays. Scout to verify assumptions before acting. |
| "The fix is done, tests pass" | Without prevention, same bug class will recur. Add guards. |

The only sanctioned shortcut is `--quick` for trivial issues (lint, type
errors), and even there the pre-fix state capture and the before/after
comparison are mandatory.

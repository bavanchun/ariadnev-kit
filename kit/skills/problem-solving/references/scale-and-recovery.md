# Scale Game and Stuck Recovery

Read this reference when someone says “should scale fine” without testing,
production limits are unknown, or no primary technique has restored progress.

## Scale game

Extremes expose assumptions hidden at normal scale. Test both directions: a
design can be over-engineered at the minimum and unsafe at the maximum.

| Dimension | Minimum ↔ maximum | Reveals |
|---|---|---|
| Volume | 1 item ↔ 1 billion | algorithmic and storage limits |
| Speed | instant ↔ one year | async, caching, expiry requirements |
| Users | 1 ↔ 1 billion | concurrency and resource limits |
| Duration | milliseconds ↔ years | leaks, cleanup, unbounded state |
| Failure rate | never fails ↔ always fails | error handling adequacy |

### Process

1. **Pick a dimension.** What could vary extremely?
2. **Test the minimum.** What if it were 1000x smaller, faster, or fewer?
3. **Test the maximum.** What if it were 1000x bigger, slower, or more?
4. **Note what breaks.** Where do limits appear, and by which mechanism?
5. **Note what survives.** What is fundamentally sound at both extremes?
6. **Design for reality.** Compare the real operating range with those limits
   and use the insight to validate the architecture.

Do not stop at “it breaks.” Convert the predicted break into a measurable
threshold, load case, failure injection, or long-duration test whenever the
decision matters to implementation.

### Scale artifact

| Dimension | Minimum result | Maximum result | Break point | Real range | Action |
|---|---|---|---|---|---|
| <dimension> | <survives/removable> | <failure> | <limit> | <expected> | <test/design> |

After the scale game, you should know where the system breaks, what survives,
what needs redesign, and whether production readiness is measured or still a
hypothesis. “Should scale fine” without evidence remains unresolved.

## When the first technique does not work

Do not repeat a technique unchanged. Record the failed attempt, then use the
new symptom to dispatch again. If nothing fits:

1. **Reframe the problem.** Are you solving the right problem?
2. **Get a fresh perspective.** Explain it to someone else using observed facts.
3. **Take a break.** Distance can reveal assumptions hidden by repetition.
4. **Simplify scope.** Solve a smaller version first.
5. **Question constraints.** Are they real, current, and owned—or assumed?
6. **Stop deliberately.** Drop the task when the cost exceeds the supported
   value rather than inventing more complexity.

## Recovery combinations

- Scale reveals too much machinery at the minimum → simplification cascade.
- Scale reveals the same limit in several domains → meta-pattern recognition.
- A constraint blocks every option → inversion exercise.
- The domain offers no useful mechanism → collision-zone thinking.

Every recovery ends with one observable experiment or a clear rescope/stop
condition. “Think more” is not a next action.

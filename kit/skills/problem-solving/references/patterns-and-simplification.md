# Patterns and Simplification

Read this reference when complexity grows through repeated variants or the same
problem shape keeps appearing in different places.

## Simplification cascade

A valid cascade finds one domain-independent insight that makes several
implementations, branches, options, or components unnecessary. The metric is
what can be deleted, not how sophisticated the abstraction looks.

### Process

1. **List variations.** What is implemented multiple ways?
2. **Find the essence.** What is the same underneath?
3. **Extract an abstraction.** State the domain-independent pattern.
4. **Test fit.** Do all current cases fit cleanly without flags and exceptions?
5. **Measure the cascade.** How many things become unnecessary?
6. **Prototype the smallest case.** Confirm the abstraction before migrating
   every caller.

Watch for “just one more case,” parallel handlers with nearly identical flow,
growing configuration, and refactors that move complexity rather than remove
it.

### Cascade artifact

| Variation | Shared essence | Fit without exception? | Removed if adopted |
|---|---|---|---|
| <case A/B/C> | <one rule> | yes/no + reason | <branches/files/options> |

Reject the abstraction when several cases need type flags, special callbacks,
or leaky conditionals. Similarity alone is not simplification. Prefer deletion
and a boring common path over a new framework with one caller.

## Meta-pattern recognition

Use meta-pattern recognition when the same shape appears in three or more
independent domains. One occurrence may be coincidence; two suggest a pattern;
three provide enough variation to test a reusable principle.

### Process

1. **Spot repetition.** Find the same shape in 3+ places or domains.
2. **Extract the abstract form.** Describe it without domain-specific nouns.
3. **Identify variations.** How does the form adapt per domain?
4. **Check applicability.** Where else might it help, and where does it fail?
5. **Document the pattern.** Make the invariant and variation points reusable.
6. **Test a new application.** Prediction on an unseen case is stronger than a
   retrospective analogy.

### Pattern artifact

| Domain | Concrete form | Shared invariant | Variation point |
|---|---|---|---|
| API / traffic / admission | rate limit | bound resource consumption | window and overflow action |

The domain-independence test is simple: can the pattern be stated without the
names of any examples? If not, keep gathering evidence rather than declaring a
universal abstraction.

## Combining the two

Meta-pattern recognition discovers a reusable shape; simplification asks
whether that shape can collapse the current implementations. Apply them in
that order when repetition crosses domains. Apply simplification alone when
variants share one local contract and broad universality is irrelevant.

The final proposal must name:

- the invariant;
- permitted variation points;
- cases that do not fit;
- concrete deletions;
- the regression proof needed before removing old paths.

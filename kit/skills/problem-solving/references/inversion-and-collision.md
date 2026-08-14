# Inversion and Collision

Read this reference when a solution feels forced by assumptions or when every
conventional approach inside one domain has been exhausted.

## Inversion exercise

Use inversion for statements such as “must be done this way”, “there is only
one way”, or “this is just how it works.” If someone cannot articulate why a
constraint is necessary, question the “must.”

### Process

1. **List core assumptions.** What “must” be true for the current solution?
2. **Invert each systematically.** Ask, “What if the opposite were true?”
3. **Explore implications.** What would we do differently under that inversion?
4. **Find valid inversions.** Which opposite actually works in some context?
5. **Test boundaries.** Identify where the inversion becomes unsafe or false.
6. **Document insights.** What did we learn, including failed inversions?

Common dimensions are eager ↔ lazy, push ↔ pull, store ↔ compute, add ↔ remove,
and optimize ↔ simplify.

An inversion is not automatically good. “Derive instead of store” may be valid
when computation is cheaper; “trust all user input” is invalid because it
removes a security boundary. Preserve non-negotiable safety invariants.

### Inversion artifact

| Assumption | Opposite | Valid where? | Boundary/risk | Insight |
|---|---|---|---|---|
| <must statement> | <inversion> | <context> | <failure condition> | <lesson> |

The result can be “the original rule is correct here,” provided the test made
its context explicit.

## Collision-zone thinking

Use collision when incremental variations inside the current domain are not
producing a fitting approach. The goal is a transferable mechanism, not a cute
metaphor.

### Process

1. **Pick two unrelated concepts** from different domains.
2. **Force the combination:** “What if we treated A like B?”
3. **Explore emergent properties.** What new capabilities appear?
4. **Test boundaries.** Where does the metaphor break?
5. **Extract insight.** Which mechanism transfers without importing false
   assumptions?
6. **Select an experiment.** Test the smallest useful transferred mechanism.

Source domains with rich mechanisms include biology, physics, economics,
psychology, logistics, and physical architecture. Choose a domain because it
has a mechanism related to the observed constraint—not at random.

### Collision artifact

| Current problem | Imported model | Emergent property | Break point | Testable insight |
|---|---|---|---|---|
| Cascading service failure | Electrical circuit | Isolation / breaker | Services retry and heal | Open circuit after threshold |

Document failed collisions too. A metaphor that breaks immediately can reveal
which property of the original problem is actually essential.

## Selection guard

- Forced by assumptions → inversion first.
- No suitable mechanism in the current domain → collision first.
- A borrowed metaphor itself starts sounding mandatory → invert its assumptions.
- The insight creates several implementations → route to simplification after
  one experiment confirms the mechanism.

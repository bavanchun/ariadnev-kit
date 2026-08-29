---
"ariadnev": minor
---

Add omp, grok and dsh to the verified provider set.

Each cell in the provider matrix is verified before it is used; an unverified
(provider, artifact) pair is skipped and logged rather than guessed. These three join
that matrix with the paths and formats their runtimes actually read.

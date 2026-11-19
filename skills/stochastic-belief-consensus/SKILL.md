---
name: stochastic-belief-consensus
description: Analyze or implement uncertain multiple-attribute group decisions using incomplete belief distributions, stochastic rank stability, and Jensen-Shannon plus entropy consensus. Use when applying or reviewing Dai et al.'s stochastic consensus method, including evaluator disagreement and sensitivity analysis; ordinary scoring without belief distributions does not need this skill.
---

# Stochastic Belief Consensus

Turn uncertain group assessments into an auditable consensus analysis using Dai, Li, Zhou, and Wu (2025), [source paper](https://doi.org/10.1016/j.asoc.2024.112495). Distinguish the published method, mathematical interpretation, and application-specific extensions. Agreement measures do not establish decision accuracy or evaluator expertise.

## Choose the task

- For explanation, method review, or implementation, read [references/method.md](references/method.md), including its equation caveats.
- For computation, also read [references/computation.md](references/computation.md). The standard-library helper implements sampling and consensus, not ER aggregation or consensus optimization.
- For mapping to candidate assessment or another consequential decision, also read [references/application.md](references/application.md). Use the method as decision support and preserve the evidence and dissent behind the assessments.

## Workflow

1. Establish alternatives, attributes, evaluators, ordered grades and utility values. Preserve the user's criteria. Obtain attribute weights for ranking, the consensus threshold `gamma`, and distance mixture `alpha`; record their rationale. The paper's examples use `alpha=0.5` and `gamma=0.8`, but these are illustrative settings, not validated universal cutoffs.
2. Validate a common tensor `[evaluator][alternative][attribute][grade]`. Assigned beliefs must be finite and nonnegative with sum at most one. The residual is ignorance about the grade, not a poor grade. Align grades and benefit/cost direction before comparing evaluators. Do not silently discard incomplete assessments or renormalize substantial missing mass.
3. Specify how ignorance is allocated across grades, including dependence assumptions. The paper does not specify a reproducible density or full sampling configuration. A uniform simplex allocation is an explicit implementation choice. Record distribution, seed, trials, numerical tolerances, and versions; vary meaningful assumptions in sensitivity analysis.
4. If evaluator weights or final ranks are requested, use verified evidential reasoning (ER) to aggregate each sampled alternative over attributes, then count complete rank vectors. Estimate each evaluator's most probable complete rank and normalize those probabilities using Eq. (13). Report these as rank-stability weights. A weighted arithmetic mean is an alternative method and must be labeled as a departure from ER. Do not claim end-to-end paper reproduction without verified ER, original inputs, and sampling details.
5. Calculate base-2 square-root Jensen-Shannon distance, normalized entropy difference, their `alpha` mixture, and the unweighted mean across cells and evaluator pairs. Neither attribute weights nor evaluator weights enter the paper's consensus index. Report both `GCR = P(CI >= gamma)` and `E[CI | CI >= gamma]`, alongside unconditional agreement and the number of accepted draws. The conditional expectation is a disclosed interpretation of ambiguous Eq. (24), not a literal transcription.
6. If accepted draws exist, retain conditional mean belief matrices as derived scenarios; preserve original inputs. If none are found, increase precision or examine feasibility before claiming an empty consensus region. Consider evidence clarification first. When optimization is requested, use the nonlinear minimum-adjustment formulation in the method reference; preserve proposed revisions separately and let evaluators review them. Do not silently overwrite assessments.
7. When producing a final ranking, combine evaluator information and attributes with a verified, specified ER variant and report utilities and rank uncertainty. Explain that aggregating conditional mean matrices and averaging per-draw ER outputs are different procedures. Label conditional rankings as dependent on the acceptance filter.

## Interpretation checks

- Show a reproducible configuration, dimension checks, GCR interval, accepted sample count, conditional/unconditional agreement, sensitivity results, and unresolved limitations. A numerical helper run alone does not validate an application.
- At `alpha=0`, distinct distributions with identical entropy have distance zero; agreement may be misleading. Discuss this degeneracy before using entropy alone.
- Rank stability rewards certainty under the model; it does not measure expertise, calibration, honesty, fairness, or predictive validity. Compare derived weights with equal or independently justified weights when weighting matters.
- Conditioning on high agreement can remove plausible disagreement. Report the fraction retained and substantive differences from the full distribution. Do not present a high conditional average as high probability of agreement.
- Identify local versus global solver claims, repeated-start results, feasibility residuals, and parameter sensitivity. Preserve ties rather than inventing a deterministic tie break.

## Reusable calculation

Run `python scripts/consensus.py INPUT.json --output RESULT.json` from this skill directory using the schema and synthetic example in the computation reference. The helper has no third-party dependencies. Run `python scripts/test_consensus.py` to verify its mathematical and input-handling invariants. Use configurable datasets, not the synthetic example, for actual analysis.

The skill contains independently written method notes and code. It does not redistribute the full article or claim to include the authors' implementation or complete case-study datasets.

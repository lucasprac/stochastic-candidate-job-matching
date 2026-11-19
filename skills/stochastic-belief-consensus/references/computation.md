# Running the consensus helper

`scripts/consensus.py` uses Python 3.10+ and only the standard library. It implements the paper's base-2 distances and unweighted consensus formula. Its independent uniform-simplex completion law, Monte Carlo intervals, and conditional interpretation of EAGCI are disclosed implementation choices. ER, evaluator rank generation, optimization, and final ranking are outside the executable helper's scope.

```text
python scripts/consensus.py references/synthetic-input.json --output result.json
python scripts/test_consensus.py
```

Run from the skill directory. Choose a new output path: the helper refuses to overwrite an existing file. Omit `--output` to print JSON. Validation errors produce a nonzero exit code and a concise message. No external calls or automatic installations occur.

## Input

- `matrices`: nested lists `[K][M][L][N]`; every evaluator must use the same alternatives, attributes, and grades in the same order. K>=2, M>=1, L>=1, N>=2.
- `alpha`: finite number in [0,1]. Controls JS versus entropy distance; not an evaluator weight.
- `threshold`: finite number in [0,1] specifying gamma.
- `trials`: positive integer; limits independent draws for uncertain input.
- `seed`: nonnegative integer for Python's local random generator. Record Python version as well.
- `allocation`: exactly `{"family":"uniform-simplex","independent_cells":true}` for this helper. Another density or correlated uncertainty requires a separate implementation.

Each grade list holds assigned masses only. Its residual to one is ignorance. If a sum exceeds one by at most 1e-10, the helper removes that floating-point excess proportionally; larger excess and negative/nonfinite entries are rejected. This small correction is an engineering tolerance, not evidence preprocessing. Document any upstream rounding of published tables; do not silently repair substantive discrepancies.

The supplied example is independently created synthetic data: 3 evaluators, 2 alternatives, 2 attributes, 3 grades. It uses illustrative alpha=0.5, gamma=0.8, 4000 trials, and seed=42. It does not reproduce a paper case and its parameters do not endorse a policy cutoff.

## Outputs and interpretation

| Field | Meaning |
|---|---|
| `dimensions` | K, M, L, N after validation |
| `configuration` | Seed, requested trials, alpha, gamma, law, numerical tolerance, Python version |
| `evaluation_mode` | Monte Carlo or exact evaluation of fully complete inputs |
| `evaluations` / `accepted_count` | Actual draws evaluated / those satisfying gamma |
| `gcr` | Acceptance fraction; deterministic 0 or 1 for fully complete inputs |
| `gcr_interval_95` | Wilson interval under independent draws, or exact value for deterministic input |
| `zero_acceptance_upper_bound_95` | One-sided probability bound when no Monte Carlo draws are accepted |
| `conditional_mean_ci` | Mean CI among accepted draws; null if no accepted draw |
| `conditional_mean_ci_mc_se` | Standard error over accepted draws when at least two exist; null if not estimable, zero for deterministic accepted input |
| `unconditional_mean_ci` | Mean CI over all draws |
| `accepted_contribution` | Sum of accepted CI divided by all draws |
| `conditional_mean_matrices` | Derived complete distributions averaged over accepted draws, or null |
| `mean_cell_pair_distance` | K-pair by M by L distances over all draws; useful for locating disagreement |
| `warnings` | Entropy-only degeneracy, rare conditional samples, and zero-acceptance caveats when relevant |

The GCR interval quantifies sampling uncertainty conditional on the input and model. It does not include measurement error, model uncertainty, selection bias, or uncertainty about the truth of an assessment. An interval for a conditional average concerns the accepted distribution only. Rare acceptance needs more trials and comparison with the unconditional outcomes.

`mean_cell_pair_distance` entries have evaluator indices plus a matrix of mean distances. These are disagreement diagnostics; they do not identify which evaluator is correct. Complexity is O(T*K^2*M*L*N), with streaming accumulation rather than storing every draw. Set trial count and workload to suit available resources.

## Rank-stability helper API

The module exposes `weights_from_rank_probabilities(probabilities)` for Eq. (13). Supply one list per evaluator, each containing probabilities for distinct complete rank vectors and summing to one. Obtain those probabilities from a separate, verified ER procedure. The helper cannot detect a duplicated rank label because it receives probabilities, not labels. Keep the labels and original counts in the analysis record.

For example, `[[0.8,0.2],[0.6,0.4]]` produces `[4/7,3/7]`. This is arithmetic verification, not an evaluator-expertise estimate.

## Verification and sensitivity

The tests check maximal JS distance, entropy-only degeneracy, symmetry, complete agreement, complete disagreement, deterministic threshold behavior, stochastic mass preservation, bounds, conditional normalization, zero-acceptance reporting, reproducibility, Eq. (13), and malformed/nonfinite inputs. They do not validate ER, an optimizer, article case reproduction, or real-world decisions.

For a substantive analysis, vary alpha and gamma and report absolute changes in GCR, accepted counts, agreement, and rank outcomes if independently computed. Repeat seeds and increase trials until precision is suitable. Reuse the same completed scenarios across parameter settings where practical to reduce comparison noise. A different completion law requires sensitivity work beyond this helper; do not claim law robustness after varying only seeds.

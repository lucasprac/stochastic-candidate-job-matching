# Method and source traceability

## Source

Xianchao Dai, Hao Li, Ligang Zhou, and Qun Wu. *Stochastic consensus for uncertain multiple attribute group decision-making problem in belief distribution environment*. Applied Soft Computing 168 (2025), article 112495. DOI: [10.1016/j.asoc.2024.112495](https://doi.org/10.1016/j.asoc.2024.112495). [Publisher record](https://www.sciencedirect.com/science/article/abs/pii/S1568494624012699).

These independently written notes were checked against the user-supplied 18-page PDF on 2026-10-06. Page numbers below are the printed article pages, matching PDF pages. Bibliographic metadata was also checked against the publisher record. The article reports two cases; it does not supply a complete executable reproduction package. Its data-availability statement says data can be requested (p. 17).

## Beliefs and utility (pp. 3-4, Eqs. 1-13)

Use `K` evaluators, `M` alternatives, `L` attributes, and `N >= 2` ordered grades. For a cell, assigned beliefs are `b[n] >= 0`, `sum(b) <= 1`; ignorance is `q = 1 - sum(b)`. Grade utilities `u[n]` strictly increase in `[0,1]` after direction has been aligned. Attribute weights `w[j]` and evaluator weights `lambda[k]` are distinct normalized vectors.

For a complete belief distribution, utility is `sum_n b[n] * u[n]`. For an incomplete distribution:

```text
u_min = sum_n b[n]*u[n] + q*u[0]
u_max = sum_n b[n]*u[n] + q*u[N-1]
u_mid = (u_min + u_max)/2
```

These bounds describe a single cell, not an ER aggregate. Reducing beliefs to midpoint scores loses information and is not the stochastic procedure.

A stochastic completion is `p[n] = b[n] + q*z[n]`, where `z` is nonnegative and sums to one. Thus a completion preserves already assigned mass; a complete cell is unchanged. A probability law over `z` is needed to interpret the simulated probabilities. Definitions 3-5 introduce this space without fully specifying a reproducible sampling law. Do not draw N independent uniform numbers without disclosure: normalizing uniform draws is not uniform sampling of the simplex. Normalizing independent exponential(1) draws yields a Dirichlet(1,...,1), or uniform-simplex, completion; the helper uses this disclosed choice.

For each evaluator and draw, ER aggregates each alternative's L distributions using attribute weights, followed by expected utility. Eq. (9) defines competition ranks:

```text
r[i] = 1 + number of alternatives m with U[m] > U[i]
complete_rank = (r[0], ..., r[M-1])
P[k,r] = frequency of complete_rank r for evaluator k
c[k] = max_r P[k,r]
lambda[k] = c[k] / sum_l c[l]             # Eq. 13
```

The maximum concerns the probability of an entire rank vector, not the chance of one alternative coming first, average utility, or the inverse ignorance mass. State numerical tie tolerance if used; it is an implementation choice. Rank vectors can contain ties, so the paper's permutation count does not cover every tie case.

**ER dependency:** the paper refers to ER rather than reproducing its full equations. It cites Yang and Xu (2013), *Evidential reasoning rule for evidence combination*, Artificial Intelligence 205, 1-29 (reference 36); Yang (2001), *Rule and utility based evidential reasoning approach for multiattribute decision analysis under uncertainties*, EJOR 131(1), 31-61 (reference 37); and Wang, Yang, Xu (2006), EJOR 174(3), 1885-1913 (reference 44). Before implementing ER, inspect the selected primary source, identify whether weights express importance or reliability, verify normalization/conflict handling and combination order, and record the variant. These references were identified from the supplied article; their complete formulas have not been independently validated by this skill. Do not substitute a remembered ER formula or a weighted mean and call it reproduction.

## Distribution distance (pp. 6-7, Eqs. 14-20)

For complete distributions p and r over the same N grades:

```text
m[n] = (p[n] + r[n])/2
JS(p,r) = 0.5*sum_n p[n]*log2(p[n]/m[n])
        + 0.5*sum_n r[n]*log2(r[n]/m[n])
d_JS(p,r) = sqrt(JS(p,r))
HD(p) = -sum_n p[n]*log2(p[n]) / log2(N)
d_HD(p,r) = abs(HD(p) - HD(r))
d_C(p,r) = alpha*d_JS(p,r) + (1-alpha)*d_HD(p,r)
D_C(S[k],S[l]) = sum_i sum_j d_C(p[k,i,j],p[l,i,j]) / (M*L)
```

Zero-mass terms contribute zero, including a shared zero in the mixture. Base-2 logs are essential to the claimed bounds. `JS` is divergence; its square root is the distance. Clamp only floating-point noise, not invalid inputs.

`d_HD` measures an entropy difference, not grade separation. `[1,0,0]` and `[0,0,1]` both have zero entropy; at `alpha=0` their distance is zero. For `alpha>0`, the combination distinguishes distributions; for `alpha=0` it is only a pseudometric. JS and entropy comparisons do not encode ordinal spacing or utility gaps: changing grade utilities leaves these distances unchanged. An ordinal distance would be a separately justified extension.

## Group consensus (pp. 7-8, Eqs. 21-26)

```text
CI(draw) = 2/(K*(K-1)) * sum_{k<l} (1 - D_C(S[k],S[l]))
A = {draw: CI(draw) >= gamma}
GCR = P(A)
```

Require K>=2. The matrix average treats all alternatives and attributes equally, and the pair average treats all evaluator pairs equally. Ranking weights do not enter this formula. Weighted consensus is an extension.

**Ambiguity in Eqs. (24)-(25):** as printed, these integrals omit both a density and an acceptance-region normalization. Their asserted bounds and case outputs fit a conditional interpretation, but the notation does not formally specify that interpretation. Use and disclose:

```text
EAGCI_conditional = E[CI | A] = sum_{accepted} CI / accepted_count
expected_accepted_beliefs = E[p | A]
unconditional_mean_CI = sum_all CI / trials
accepted_contribution = E[CI*1_A] = GCR * EAGCI_conditional
```

The conditional mean lies in `[gamma,1]` when A has positive probability. The accepted contribution generally does not. If no samples are accepted, return an undefined conditional mean (`null`) rather than a fictitious zero estimate; note the paper's zero convention separately. At gamma=0, a real accepted CI of zero also shows why zero cannot universally signify absence of consensus.

Simulation estimates depend on the declared completion law. An observed GCR of zero does not prove the feasible region is empty. For T independent stochastic draws with zero acceptances, a one-sided 95% binomial upper bound is `1 - 0.05**(1/T)`. This is a probability bound under the model, not a feasibility certificate. The helper supplies a Wilson interval for general GCR, a Monte Carlo standard error for conditional agreement where estimable, and accepted sample count. A fully complete input is evaluated exactly once and reports deterministic agreement.

## Minimum-adjustment optimization (pp. 8, 10, Eqs. 27-28)

When adjustment is justified, the published model chooses complete distributions x:

```text
minimize J = sum_k sum_i sum_j sum_n abs(x[k,i,j,n] - b[k,i,j,n])
subject to CI(x) >= gamma
           sum_n x[k,i,j,n] = 1 for each k,i,j
           0 <= x[k,i,j,n] <= 1
```

Evaluator importance is equal in this adjustment objective. The published constraints do not impose `x >= b`, so this can revise assigned beliefs as well as distribute ignorance. Adding preservation bounds is a different model and may make consensus infeasible. Distinguish allocations from revisions in the report.

The objective has absolute values, and the constraint uses logarithms, square roots, and entropy differences. This is a nonlinear problem; a linear objective transformation does not make the whole problem linear or prove global optimality. The paper discusses SciPy SLSQP (pp. 15-16). If implementing a solver, verify current official documentation, explicitly handle boundary zeros, use multiple starts, and check objective and constraint residuals independently of the solver's success flag. Report a feasible local solution unless a global guarantee is established.

Even preservation-only completions have a fixed objective `sum q` whenever x>=b: adding missing mass costs q per cell. Therefore this L1 cost does not uniquely choose allocations. For a wholly ignorant cell, the L1 cost is one for every complete x. Report non-uniqueness and alternative feasible solutions; do not describe a solver-selected value as observed evidence.

## Final aggregation (pp. 10-13)

The article uses ER to combine accepted mean distributions (or adjusted distributions) with evaluator and attribute weights, then derives utilities. Specify aggregation order and ER variant. In general `ER(E[p | A])` differs from `E[ER(p) | A]` because ER is nonlinear. If rank acceptabilities from draws are also reported, distinguish them from the ranking of the aggregated conditional means.

## Source discrepancies to retain

| Location | Issue | Treatment |
|---|---|---|
| p. 4, before Eq. 13 | Cross-reference points to Eq. 23 for rank probabilities | Use Eq. 12 and empirical rank frequencies. |
| p. 8, Eqs. 24-25 | Missing density/normalization in expected integrals | State the conditional interpretation explicitly. |
| p. 11, workflow | Cross-references to Eq. 24 for expected matrices and Model 2 in the general flow | Expected matrices correspond to Eq. 25; the general optimizer is Model 1. |
| p. 12, Model 2 | Printed CI multiplier is 1/84 for K=3, M=4, L=6 | Eq. 22 gives 2/(3*2*4*6)=1/72. Record which formula is used. |
| p. 12, Table 5 | E3 contains a duplicated printed rank with different probabilities | Do not silently treat it as a verified complete rank table. |
| p. 12, case description | Says eleven grades but enumerates five | Use the explicit five-grade set for that example, noting the inconsistency. |
| p. 13 | Narrative reverses the two case branches and calls a2 worst despite a1 ranking last | Follow the explicit case calculations, flag narrative discrepancies. |

Reported case 1 results are lambda=(0.32,0.28,0.40), EAGCI=0.81, GCR=0.24 at gamma=0.8, ranking a3>a4>a1>a2. These are author-reported figures, not independently reproduced outcomes. Case illustrations do not establish predictive validity in hiring, fairness, or superiority across applications. Sensitivity patterns observed in the article are not universal monotonicity guarantees.

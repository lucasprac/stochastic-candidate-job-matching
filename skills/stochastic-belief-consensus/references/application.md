# Application boundaries and evidence mapping

## Mapping to a decision

Document what the alternatives, attributes, grades, evaluators, and each assigned mass mean in the application. A belief distribution is an elicited assessment, not automatically a calibrated frequency distribution. Avoid fabricated mass assignments from prose. If only crisp scores exist, ask whether uncertainty can be elicited and validated, or use a simpler transparent rubric instead.

For a candidate-assessment research prototype, alternatives can be candidates for one specified role, attributes can be explicit role criteria, and evaluators can be assessors sharing an anchored rubric. The paper's interview illustration is a numerical application, not evidence that this method predicts job performance or supports automated hiring decisions. Multiple roles require explicit role-specific criteria and separate comparisons; a group ranking is not a candidate-job matching or assignment algorithm.

Preserve the user's exact criteria and supporting observations. Keep missing evidence, evaluator uncertainty, disagreement, and poor performance distinct. A fully missing cell may be modeled as ignorance=1 only after declaring that interpretation. Statistical completion is hypothetical information; it does not recover a candidate's actual unobserved performance.

## Choosing the simpler method

Use a fixed rubric with equal or independently justified evaluator weights when uncertainty is limited or the completion law lacks a credible rationale. Add stochastic analysis when it answers a concrete question about robustness, plausible disagreement, or evaluator rank stability. Report the additional assumptions and the comparison with the simpler baseline.

Rank-stability weights may reward an overconfident evaluator. Require separate evidence for expertise, reliability, or calibration if making those claims. Distances and consensus indices measure agreement on the shared grade labels; they do not validate the underlying rubric or eliminate shared bias.

For consequential people decisions, keep derived assessments and adjustment suggestions reviewable alongside originals. Agreement filtering can mask dissent: show discarded probability mass, evaluator-level evidence, and material changes to outcomes. Optimizer outputs are suggestions for discussion; they are not new evidence. Do not rewrite observed evidence or psychometric scores to improve agreement, and do not infer personality traits from consensus measures.

## Report content

Match the requested deliverable, but retain enough information to audit:

- The question and how the input maps to it, data provenance, rubric anchors, and missingness interpretation.
- Attribute weights, any evaluator weights, alpha, gamma, and their separate purposes.
- Completion law and dependence assumptions, simulation precision, seed and versions.
- GCR with uncertainty interval; conditional and unconditional agreement; accepted count and retained probability mass.
- Disagreement locations and sensitivity to meaningful parameter/model choices, with absolute changes rather than only significance tests.
- If ranking is included, ER variant and aggregation order, rank uncertainty, ties, and comparison with the simpler baseline.
- If optimization is included, proposed changes, L1 cost, feasibility residuals, solver/start details, non-uniqueness, and evaluator review status.
- Which results are published, reproduced, newly computed, or unresolved; no claim of application validity without relevant empirical evidence.

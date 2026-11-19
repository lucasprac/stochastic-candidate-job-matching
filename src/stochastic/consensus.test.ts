import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  TOLERANCE,
  analyzeConsensus,
  analyzeStochasticEvaluation,
  completeBelief,
  distances,
  fsum,
  mulberry32,
  validateInput,
  weightsFromRankProbabilities,
  wilsonInterval,
  type ConsensusInput,
} from './consensus';
import {
  QUICK_PRESETS,
  STOCHASTIC_PRESETS,
  SYNTHETIC_DEMO_DATA,
  buildQuickQuestionsPayload,
} from '../data/presets';

function config(
  matrices: number[][][][],
  overrides: Partial<Omit<ConsensusInput, 'matrices'>> = {},
): ConsensusInput {
  return {
    matrices,
    alpha: 0.5,
    threshold: 0.8,
    trials: 100,
    seed: 42,
    allocation: { family: 'uniform-simplex', independent_cells: true },
    ...overrides,
  };
}

describe('Stochastic belief consensus engine (Dai et al., 2025)', () => {
  it('handles extreme JS distance and entropy-only degeneracy', () => {
    expect(distances([1, 0], [0, 1], 1)).toEqual([1, 0, 1]);
    expect(distances([1, 0], [0, 1], 0)).toEqual([1, 0, 0]);
  });

  it('satisfies identity, symmetry, and normalized entropy bounds', () => {
    const p = [0.1, 0.2, 0.7];
    const q = [0.3, 0.3, 0.4];
    expect(distances(p, p, 0.4)).toEqual([0, 0, 0]);

    const dpq = distances(p, q, 0.4);
    const dqp = distances(q, p, 0.4);
    dpq.forEach((val, idx) => {
      expect(val).toBeCloseTo(dqp[idx], 12);
    });

    expect(distances([1, 0], [0.5, 0.5], 0)[1]).toBeCloseTo(1, 12);
  });

  it('avoids midpoint underflow on subnormal masses and satisfies triangle inequality', () => {
    const subnormal = distances([5e-324, 1], [0, 1], 0.5);
    expect(subnormal.every((x) => Number.isFinite(x))).toBe(true);

    const p = [0.1, 0.2, 0.7];
    const q = [0.3, 0.3, 0.4];
    const r = [0.8, 0.1, 0.1];
    expect(distances(p, r, 0.5)[2]).toBeLessThanOrEqual(
      distances(p, q, 0.5)[2] + distances(q, r, 0.5)[2] + 1e-12,
    );
  });

  it('evaluates complete agreement in exact deterministic mode', () => {
    const result = analyzeConsensus(
      config([[[[0.25, 0.75]]], [[[0.25, 0.75]]]], { threshold: 1 }),
    );
    expect(result.evaluation_mode).toBe('exact_complete_input');
    expect(result.evaluations).toBe(1);
    expect(result.gcr_interval_95).toEqual([1, 1]);
    expect(result.conditional_mean_ci).toBe(1);
    expect(result.conditional_mean_ci_mc_se).toBe(0);
    expect(result.zero_acceptance_upper_bound_95).toBeNull();
    expect(result.warnings).toEqual([]);
  });

  it('evaluates complete disagreement in exact mode with null conditional mean', () => {
    const result = analyzeConsensus(config([[[[1, 0]]], [[[0, 1]]]], { alpha: 1 }));
    expect(result.evaluation_mode).toBe('exact_complete_input');
    expect(result.gcr_interval_95).toEqual([0, 0]);
    expect(result.conditional_mean_ci).toBeNull();
    expect(result.conditional_mean_matrices).toBeNull();
    expect(result.unconditional_mean_ci).toBe(0);
    expect(result.zero_acceptance_upper_bound_95).toBeNull();
  });

  it('accepts zero consensus when threshold is zero', () => {
    const result = analyzeConsensus(
      config([[[[1, 0]]], [[[0, 1]]]], { alpha: 1, threshold: 0 }),
    );
    expect(result.gcr).toBe(1);
    expect(result.conditional_mean_ci).toBe(0);
  });

  it('completes beliefs on uniform simplex while preserving assigned mass', () => {
    const rng = mulberry32(19);
    const base = [0.1, 0.5, 0.2];
    for (let t = 0; t < 100; t += 1) {
      const completed = completeBelief(base, rng);
      expect(fsum(completed)).toBeCloseTo(1, 12);
      completed.forEach((val, idx) => {
        expect(val).toBeGreaterThanOrEqual(base[idx]);
      });
    }
    expect(completeBelief([1, 0], rng)).toEqual([1, 0]);
  });

  it('matches Dirichlet(1,1,1) uniform-simplex moments', () => {
    const rng = mulberry32(9);
    const nDraws = 6000;
    const firstCoord: number[] = [];
    for (let i = 0; i < nDraws; i += 1) {
      firstCoord.push(completeBelief([0, 0, 0], rng)[0]);
    }
    const mean = fsum(firstCoord) / nDraws;
    const variance = fsum(firstCoord.map((x) => (x - mean) ** 2)) / nDraws;
    expect(Math.abs(mean - 1 / 3)).toBeLessThan(0.012);
    expect(Math.abs(variance - 1 / 18)).toBeLessThan(0.006);
  });

  it('computes reproducible conditional estimates on synthetic-input.json without mutating input', () => {
    const syntheticPath = resolve(
      process.cwd(),
      'skills/stochastic-belief-consensus/references/synthetic-input.json',
    );
    const data = JSON.parse(readFileSync(syntheticPath, 'utf-8')) as ConsensusInput;
    data.trials = 300;
    data.threshold = 0.88;
    const before = structuredClone(data);

    const result = analyzeConsensus(data);
    expect(data).toEqual(before);
    expect(result).toEqual(analyzeConsensus(data));
    expect(result.evaluation_mode).toBe('monte_carlo');
    expect(result.accepted_count).toBeGreaterThan(0);
    expect(result.accepted_count).toBeLessThan(result.evaluations);
    expect(result.gcr).toBeLessThanOrEqual(1);
    expect(result.conditional_mean_ci).not.toBeNull();
    expect(result.conditional_mean_ci!).toBeGreaterThanOrEqual(data.threshold);
    expect(result.conditional_mean_ci!).toBeLessThanOrEqual(1);
    expect(result.accepted_contribution).toBeCloseTo(
      result.gcr * result.conditional_mean_ci!,
      12,
    );

    expect(result.conditional_mean_matrices).not.toBeNull();
    for (const matrix of result.conditional_mean_matrices!) {
      for (const row of matrix) {
        for (const cell of row) {
          expect(fsum(cell)).toBeCloseTo(1, 12);
        }
      }
    }
  });

  it('reports zero-acceptance binomial 95% upper bound and warning in Monte Carlo mode', () => {
    const data = config([[[[0.99, 0]]], [[[0, 0.99]]]], { alpha: 1, threshold: 0.9 });
    const result = analyzeConsensus(data);
    expect(result.gcr).toBe(0);
    expect(result.conditional_mean_ci).toBeNull();
    expect(result.conditional_mean_ci_mc_se).toBeNull();
    expect(result.gcr_interval_95[1]).toBeGreaterThan(0);
    expect(result.zero_acceptance_upper_bound_95).toBeCloseTo(1 - 0.05 ** 0.01, 12);
    expect(result.warnings.length).toBeGreaterThanOrEqual(1);
  });

  it('emits alpha=0 degeneracy warning and <30 rare acceptance warning', () => {
    const zeroAlpha = analyzeConsensus(config([[[[1, 0]]], [[[0, 1]]]], { alpha: 0, threshold: 0.5 }));
    expect(zeroAlpha.warnings.some((w) => w.includes('alpha = 0'))).toBe(true);

    // Construct case with very rare acceptance (between 1 and 29 accepted out of 200)
    const rare = analyzeConsensus(
      config([[[[0.6, 0.1]]], [[[0.1, 0.6]]]], { alpha: 1, threshold: 0.42, trials: 100, seed: 42 }),
    );
    if (rare.accepted_count > 0 && rare.accepted_count < 30) {
      expect(rare.warnings.some((w) => w.includes('Poucos sorteios aceitos'))).toBe(true);
    }
  });

  it('averages cell distances across pairs and cells correctly', () => {
    const result = analyzeConsensus(
      config(
        [
          [[[1, 0], [1, 0]]],
          [[[1, 0], [0, 1]]],
          [[[0, 1], [0, 1]]],
        ],
        { alpha: 1, threshold: 0 },
      ),
    );
    expect(result.unconditional_mean_ci).toBeCloseTo(1 / 3, 12);
    expect(result.mean_cell_pair_distance).toHaveLength(3);
  });

  it('computes Eq. (13) rank-stability weights and validates rank probabilities', () => {
    const weights = weightsFromRankProbabilities([
      [0.8, 0.2],
      [0.6, 0.4],
    ]);
    expect(weights[0]).toBeCloseTo(4 / 7, 12);
    expect(weights[1]).toBeCloseTo(3 / 7, 12);
    expect(weightsFromRankProbabilities([[1], [1]])).toEqual([0.5, 0.5]);
    expect(() => weightsFromRankProbabilities([[0.8, 0.3]])).toThrow();
  });

  it('validates malformed inputs and scales tiny floating-point excess within TOLERANCE', () => {
    const base = config([[[[1, 0]]], [[[1, 0]]]]);

    // Excess within TOLERANCE should be scaled proportionally without error
    const tinyExcess = config([[[[0.5 + TOLERANCE * 0.5, 0.5]]], [[[1, 0]]]]);
    const validated = validateInput(tinyExcess);
    expect(fsum(validated.matrices[0][0][0])).toBeCloseTo(1, 12);

    const badValues: Array<[string, unknown]> = [
      ['alpha', Number.NaN],
      ['threshold', 1.1],
      ['trials', true],
      ['trials', 0],
      ['seed', -1],
      ['seed', 1.2],
      ['allocation', { family: 'uniform-simplex', independent_cells: 1 }],
      ['matrices', [[[[1, 0]]]]],
      ['matrices', []],
      ['matrices', [[[[0.7, 0.7]]], [[[1, 0]]]]],
      ['matrices', [[[[1, 0]]], [[[1, -0.1]]]]],
      ['matrices', [[[[1, 0]]], [[[1, 0, 0]]]]],
      ['matrices', [[[[1, 0]]], [[[1, Number.POSITIVE_INFINITY]]]]],
      ['matrices', [[[[1, 0]]], [[[0.5, 0.5]], [[1, 0]]]]],
    ];

    for (const [field, value] of badValues) {
      expect(() => validateInput({ ...base, [field]: value } as ConsensusInput)).toThrow();
    }

    expect(() => validateInput({ ...base, extra: 1 } as unknown as ConsensusInput)).toThrow();
    expect(() => distances([0.2, 0.2], [1, 0], 0.5)).toThrow();
  });
});

describe('analyzeStochasticEvaluation', () => {
  it('matches analyzeConsensus identically and enforces ignorance & rank invariants', () => {
    const syntheticPath = resolve(
      process.cwd(),
      'skills/stochastic-belief-consensus/references/synthetic-input.json',
    );
    const input = JSON.parse(readFileSync(syntheticPath, 'utf-8')) as ConsensusInput;
    input.trials = 400;

    const directConsensus = analyzeConsensus(input);
    const evalResult = analyzeStochasticEvaluation({ input });

    expect(evalResult.consensus).toEqual(directConsensus);
    expect(evalResult.gradeUtilities).toEqual([0, 0.5, 1]);
    expect(evalResult.attributeWeights).toEqual([0.5, 0.5]);
    expect(fsum(evalResult.evaluatorWeightsRankStability)).toBeCloseTo(1, 12);
    expect(fsum(evalResult.evaluatorEqualWeights)).toBeCloseTo(1, 12);
    expect(evalResult.rankingMethodologyNote).toContain('Yang & Xu (2013)');
    expect(evalResult.rankingMethodologyNote).toContain('Eq. (13)');

    for (const cand of evalResult.candidates) {
      expect(cand.ignoranceUtilityMin).toBeLessThanOrEqual(cand.utilityP05 + 1e-12);
      expect(cand.utilityP05).toBeLessThanOrEqual(cand.meanUtilityEqual + 1e-12);
      expect(cand.meanUtilityEqual).toBeLessThanOrEqual(cand.utilityP95 + 1e-12);
      expect(cand.utilityP95).toBeLessThanOrEqual(cand.ignoranceUtilityMax + 1e-12);
      expect(cand.meanUtilityRankWeighted).toBeGreaterThanOrEqual(cand.ignoranceUtilityMin - 1e-12);
      expect(cand.meanUtilityRankWeighted).toBeLessThanOrEqual(cand.ignoranceUtilityMax + 1e-12);
      expect(fsum(cand.rankProbabilitiesEqual)).toBeCloseTo(1, 12);
      expect(fsum(cand.rankProbabilitiesRankWeighted)).toBeCloseTo(1, 12);

      const expectedRankFromProbs = cand.rankProbabilitiesEqual.reduce(
        (acc, p, idx) => acc + (idx + 1) * p,
        0,
      );
      expect(cand.expectedRankEqual).toBeCloseTo(expectedRankFromProbs, 12);
    }

    // Paired sensitivity grid matches exact consensus cell at (0.5, 0.8) and is monotonic in threshold
    const aIdx = evalResult.sensitivityGrid.alphas.indexOf(0.5);
    const tIdx = evalResult.sensitivityGrid.thresholds.indexOf(0.8);
    expect(aIdx).toBeGreaterThanOrEqual(0);
    expect(tIdx).toBeGreaterThanOrEqual(0);
    const matchingCell = evalResult.sensitivityGrid.cells[aIdx][tIdx];
    expect(matchingCell.gcr).toBe(directConsensus.gcr);
    expect(matchingCell.acceptedCount).toBe(directConsensus.accepted_count);
    expect(matchingCell.conditionalMeanCi).toBe(directConsensus.conditional_mean_ci);

    for (const row of evalResult.sensitivityGrid.cells) {
      for (let j = 1; j < row.length; j += 1) {
        expect(row[j].gcr).toBeLessThanOrEqual(row[j - 1].gcr + 1e-12);
      }
    }
  });

  it('preserves exact competition ties within 1e-12 and computes tieRate accurately', () => {
    // 2 evaluators, 3 candidates (first two differ by 5e-13, third is strictly lower), 1 criterion, 2 grades
    const input = config(
      [
        [[[0.2, 0.8]], [[0.2 - 5e-13, 0.8 + 5e-13]], [[0.9, 0.1]]],
        [[[0.2, 0.8]], [[0.2 - 5e-13, 0.8 + 5e-13]], [[0.9, 0.1]]],
      ],
      { trials: 50, threshold: 0.9 },
    );

    const res = analyzeStochasticEvaluation({ input });
    expect(res.consensus.evaluation_mode).toBe('exact_complete_input');
    expect(res.candidates[0].rankProbabilitiesEqual).toEqual([1, 0, 0]);
    expect(res.candidates[1].rankProbabilitiesEqual).toEqual([1, 0, 0]);
    expect(res.candidates[2].rankProbabilitiesEqual).toEqual([0, 0, 1]);
    expect(res.candidates[0].expectedRankEqual).toBe(1);
    expect(res.candidates[1].expectedRankEqual).toBe(1);
    expect(res.candidates[2].expectedRankEqual).toBe(3);
    expect(res.candidates[0].tieRate).toBe(1);
    expect(res.candidates[1].tieRate).toBe(1);
    expect(res.candidates[2].tieRate).toBe(0);
  });

  it('assigns higher Eq. (13) rank-stability weight to a certain evaluator vs. a wholly ignorant evaluator', () => {
    // Evaluator 0 has crisp separation [0, 1] vs [1, 0]; Evaluator 1 has complete ignorance [0, 0] vs [0, 0]
    const input = config(
      [
        [[[0, 1]], [[1, 0]]],
        [[[0, 0]], [[0, 0]]],
      ],
      { trials: 400, seed: 7 },
    );
    const res = analyzeStochasticEvaluation({ input });
    expect(res.evaluatorMaxRankProbabilities[0]).toBe(1);
    expect(res.evaluatorMaxRankProbabilities[1]).toBeLessThan(0.75);
    expect(res.evaluatorWeightsRankStability[0]).toBeGreaterThan(
      res.evaluatorWeightsRankStability[1],
    );
  });

  it('matches Python wilson_interval and validates custom gradeUtilities and attributeWeights', () => {
    const wi = wilsonInterval(4000, 4000);
    expect(wi[0]).toBeCloseTo(0.9990405567102987, 14);
    expect(wi[1]).toBe(1);

    expect(() =>
      analyzeStochasticEvaluation({
        input: config([[[[1, 0]]], [[[1, 0]]]]),
        gradeUtilities: [0.5, 0.5],
      }),
    ).toThrow();
    expect(() =>
      analyzeStochasticEvaluation({
        input: config([[[[1, 0]]], [[[1, 0]]]]),
        attributeWeights: [0],
      }),
    ).toThrow();
  });
});

describe('Domain presets and synthetic demo data', () => {
  it('matches references/synthetic-input.json exactly and executes stochastic evaluation cleanly', () => {
    const syntheticPath = resolve(
      process.cwd(),
      'skills/stochastic-belief-consensus/references/synthetic-input.json',
    );
    const referenceJson = JSON.parse(readFileSync(syntheticPath, 'utf-8')) as ConsensusInput;

    expect(SYNTHETIC_DEMO_DATA.isSyntheticLocal).toBe(true);
    expect(SYNTHETIC_DEMO_DATA.input).toEqual(referenceJson);

    const evalRes = analyzeStochasticEvaluation({
      input: SYNTHETIC_DEMO_DATA.input,
      gradeUtilities: SYNTHETIC_DEMO_DATA.gradeUtilities,
      attributeWeights: SYNTHETIC_DEMO_DATA.criteria.map((c) => c.weight),
    });

    expect(evalRes.consensus.evaluation_mode).toBe('monte_carlo');
    expect(evalRes.consensus.evaluations).toBe(4000);
    expect(evalRes.consensus.gcr).toBeGreaterThan(0.99);
    expect(evalRes.consensus.conditional_mean_ci).toBeCloseTo(0.871, 2);
    expect(evalRes.candidates).toHaveLength(2);
    // Candidate 0 has higher Medium/High mass than Candidate 1 in synthetic-input.json
    expect(evalRes.candidates[0].meanUtilityEqual).toBeGreaterThan(
      evalRes.candidates[1].meanUtilityEqual,
    );
  });

  it('provides 2 complete PT-BR stochastic evaluation presets and 3 valid Playground presets', () => {
    expect(STOCHASTIC_PRESETS).toHaveLength(2);
    for (const preset of STOCHASTIC_PRESETS) {
      expect(preset.candidates).toHaveLength(3);
      expect(preset.criteria.length).toBeGreaterThanOrEqual(3);
      expect(preset.grades).toEqual(['Insuficiente', 'Parcial', 'Atende', 'Excepcional']);
      expect(preset.gradeUtilities).toEqual([0, 1 / 3, 2 / 3, 1]);
      expect(preset.evaluators).toHaveLength(3);
    }

    expect(QUICK_PRESETS).toHaveLength(3);
    const typesAcrossPresets = new Set<string>();
    for (const qPreset of QUICK_PRESETS) {
      const payload = buildQuickQuestionsPayload(qPreset.questions);
      const keys = Object.keys(payload);
      expect(keys.length).toBe(qPreset.questions.length);
      for (const k of keys) {
        const q = payload[k];
        typesAcrossPresets.add(q.type);
        expect(q.instructions.length).toBeGreaterThan(0);
        if (q.type === 'choice') {
          expect(Object.keys(q.criteria).length).toBeGreaterThanOrEqual(2);
        } else if (q.type === 'score') {
          expect(q.criteria.length).toBeGreaterThanOrEqual(2);
          expect(q.criteria.length).toBeLessThanOrEqual(10);
        }
      }
    }
    expect(typesAcrossPresets).toEqual(new Set(['choice', 'score', 'noul']));
  });
});

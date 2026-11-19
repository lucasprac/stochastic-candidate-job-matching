/**
 * Auditable stochastic belief consensus and candidate evaluation engine.
 *
 * Implements Dai, Li, Zhou, and Wu (2025), Eqs. 9-22 and 26, with the disclosed
 * conditional interpretation of Eqs. 24-25 and independent uniform-simplex
 * (Dirichlet(1, ..., 1)) completion of missing belief mass.
 *
 * Weighted arithmetic attribute aggregation is provided as an auditable baseline
 * distinct from Yang & Xu (2013) Evidential Reasoning (ER). Rank-stability
 * weights (Eq. 13) measure rank stability under the completion model, not
 * evaluator expertise or calibration.
 */

export const TOLERANCE = 1e-10;
export const TIE_TOLERANCE = 1e-12;

export const ALLOCATION = {
  family: 'uniform-simplex',
  independent_cells: true,
} as const;

export const DEFAULT_SENSITIVITY_ALPHAS = [0, 0.25, 0.5, 0.75, 1] as const;
export const DEFAULT_SENSITIVITY_THRESHOLDS = [0.65, 0.75, 0.8, 0.85, 0.9] as const;

export const RANKING_METHODOLOGY_NOTE =
  'Observação metodológica: a agregação de critérios por média aritmética ponderada usada nesta avaliação é uma linha de base auditável distinta da regra de Raciocínio Evidencial (ER) de Yang & Xu (2013) citada em Dai et al. (2025). Os pesos dos avaliadores derivados pela Eq. (13) medem exclusivamente a estabilidade do ranking completo sob o modelo de completação uniforme no simplex, e não expertise, calibração ou confiabilidade. Massa faltante q = 1 - soma(b) representa ignorância epistêmica, não desempenho insuficiente.';

export interface AllocationConfig {
  family: 'uniform-simplex';
  independent_cells: boolean;
}

export interface ConsensusInput {
  matrices: number[][][][];
  alpha: number;
  threshold: number;
  trials: number;
  seed: number;
  allocation: AllocationConfig;
}

export interface ConsensusDimensions {
  evaluators: number;
  alternatives: number;
  attributes: number;
  grades: number;
}

export interface ConsensusConfiguration {
  alpha: number;
  threshold: number;
  trials: number;
  seed: number;
  allocation: {
    family: 'uniform-simplex';
    independent_cells: true;
  };
  numerical_tolerance: number;
}

export type EvaluationMode = 'exact_complete_input' | 'monte_carlo';

export interface PairCellDistance {
  evaluators: [number, number];
  distances: number[][];
}

export interface ConsensusResult {
  dimensions: ConsensusDimensions;
  configuration: ConsensusConfiguration;
  evaluation_mode: EvaluationMode;
  evaluations: number;
  accepted_count: number;
  gcr: number;
  gcr_interval_95: [number, number];
  zero_acceptance_upper_bound_95: number | null;
  conditional_mean_ci: number | null;
  conditional_mean_ci_mc_se: number | null;
  unconditional_mean_ci: number;
  accepted_contribution: number;
  conditional_mean_matrices: number[][][][] | null;
  mean_cell_pair_distance: PairCellDistance[];
  interpretation: string;
  warnings: string[];
}

export interface ValidatedConsensusInput {
  matrices: number[][][][];
  alpha: number;
  threshold: number;
  trials: number;
  seed: number;
  allocation: {
    family: 'uniform-simplex';
    independent_cells: true;
  };
  dimensions: ConsensusDimensions;
}

export interface CandidateEvaluationResult {
  index: number;
  meanUtilityEqual: number;
  utilityP05: number;
  utilityP95: number;
  rankProbabilitiesEqual: number[];
  expectedRankEqual: number;
  tieRate: number;
  ignoranceUtilityMin: number;
  ignoranceUtilityMax: number;
  meanIgnorance: number;
  unweightedMeanIgnorance: number;
  meanUtilityRankWeighted: number;
  rankProbabilitiesRankWeighted: number[];
  expectedRankRankWeighted: number;
  utilityP05RankWeighted: number;
  utilityP95RankWeighted: number;
  tieRateRankWeighted: number;
  conditionalMeanUtilityEqual: number | null;
  conditionalMeanUtilityRankWeighted: number | null;
}

export interface SensitivityCell {
  alpha: number;
  threshold: number;
  gcr: number;
  acceptedCount: number;
  conditionalMeanCi: number | null;
  unconditionalMeanCi: number;
}

export interface SensitivityGrid {
  alphas: number[];
  thresholds: number[];
  cells: SensitivityCell[][];
}

export interface StochasticEvaluationParams {
  input: ConsensusInput;
  gradeUtilities?: number[];
  attributeWeights?: number[];
  sensitivityAlphas?: number[];
  sensitivityThresholds?: number[];
}

export interface StochasticEvaluationResult {
  consensus: ConsensusResult;
  evaluatorWeightsRankStability: number[];
  evaluatorMaxRankProbabilities: number[];
  evaluatorEqualWeights: number[];
  gradeUtilities: number[];
  attributeWeights: number[];
  candidates: CandidateEvaluationResult[];
  sensitivityGrid: SensitivityGrid;
  rankingMethodologyNote: string;
}

/**
 * Shewchuk-style exact floating-point summation for parity with Python's math.fsum.
 */
export function fsum(values: Iterable<number>): number {
  const partials: number[] = [];
  for (let x of values) {
    if (!Number.isFinite(x)) {
      return Number.isNaN(x) ? Number.NaN : x;
    }
    let i = 0;
    for (let j = 0; j < partials.length; j += 1) {
      let y = partials[j];
      if (Math.abs(x) < Math.abs(y)) {
        const tmp = x;
        x = y;
        y = tmp;
      }
      const hi = x + y;
      const lo = y - (hi - x);
      if (lo !== 0) {
        partials[i] = lo;
        i += 1;
      }
      x = hi;
    }
    partials.length = i;
    if (x !== 0) {
      partials.push(x);
    }
  }

  let n = partials.length;
  let hi = 0;
  if (n > 0) {
    hi = partials[--n];
    while (n > 0) {
      const x = hi;
      const y = partials[--n];
      hi = x + y;
      const lo = y - (hi - x);
      if (lo !== 0) {
        if (n > 0) {
          const next = partials[n - 1];
          if ((lo < 0 && next < 0) || (lo > 0 && next > 0)) {
            const half = lo * 2;
            const z = hi + half;
            if (half === z - hi) {
              hi = z;
            }
          }
        }
        break;
      }
    }
  }
  return hi === 0 ? 0 : hi;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function validateNumber(value: unknown, label: string, low = 0, high = 1): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < low || value > high) {
    throw new Error(`${label} deve ser um número finito no intervalo [${low}, ${high}]`);
  }
  return value === 0 ? 0 : value;
}

function validateNonemptyArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${label} deve ser um array não vazio`);
  }
  return value;
}

function validateBelief(value: unknown, label = 'belief', complete = false): number[] {
  const arr = validateNonemptyArray(value, label);
  if (arr.length < 2) {
    throw new Error(`${label} exige pelo menos dois graus`);
  }
  let result = arr.map((item, n) => validateNumber(item, `${label}[${n}]`));
  const total = fsum(result);
  if (total > 1 + TOLERANCE) {
    throw new Error(`${label} soma mais do que 1 (${total})`);
  }
  if (complete && Math.abs(total - 1) > TOLERANCE) {
    throw new Error(`${label} deve somar 1 (soma atual: ${total})`);
  }
  if (total > 1 || (complete && total !== 1)) {
    result = result.map((x) => x / total);
  }
  return result;
}

/**
 * Deterministic 32-bit seeded PRNG (Mulberry32) producing floats in [0, 1).
 */
export function mulberry32(seed: number): () => number {
  if (typeof seed !== 'number' || !Number.isInteger(seed) || seed < 0) {
    throw new Error('seed deve ser um inteiro não negativo');
  }
  let state = (Math.floor(seed / 4294967296) ^ seed) >>> 0;
  return function next(): number {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Complete a validated belief vector on the uniform simplex (Dirichlet(1,...,1))
 * without altering already assigned belief mass.
 */
export function completeBelief(b: readonly number[], rng: () => number): number[] {
  const assigned = fsum(b);
  const ignorance = Math.max(0, 1 - assigned);
  if (ignorance === 0) {
    return [...b];
  }
  const draws = new Array<number>(b.length);
  for (;;) {
    let total = 0;
    for (let n = 0; n < b.length; n += 1) {
      const u = rng();
      const safeU = u >= 1 ? 1 - Number.EPSILON : u < 0 ? 0 : u;
      const z = -Math.log(1 - safeU);
      draws[n] = z;
      total += z;
    }
    if (total > 0 && Number.isFinite(total)) {
      const totalExact = fsum(draws);
      if (totalExact > 0) {
        return b.map((x, n) => x + (ignorance * draws[n]) / totalExact);
      }
    }
  }
}

/**
 * Validate and normalize a ConsensusInput payload without mutating the caller's object.
 */
export function validateInput(data: ConsensusInput): ValidatedConsensusInput {
  const required = ['allocation', 'alpha', 'matrices', 'seed', 'threshold', 'trials'];
  if (!isPlainObject(data)) {
    throw new Error('Entrada deve conter exatamente: ' + required.join(', '));
  }
  const keys = Object.keys(data).sort();
  if (keys.length !== required.length || keys.some((k, idx) => k !== required[idx])) {
    throw new Error('Entrada deve conter exatamente: ' + required.join(', '));
  }

  const alpha = validateNumber(data.alpha, 'alpha');
  const threshold = validateNumber(data.threshold, 'threshold');
  const trials = data.trials;
  const seed = data.seed;
  if (typeof trials !== 'number' || !Number.isInteger(trials) || trials < 1) {
    throw new Error('trials deve ser um inteiro positivo (>= 1)');
  }
  if (typeof seed !== 'number' || !Number.isInteger(seed) || seed < 0) {
    throw new Error('seed deve ser um inteiro não negativo (>= 0)');
  }

  const allocation = data.allocation as unknown;
  if (!isPlainObject(allocation)) {
    throw new Error('Declare allocation uniform-simplex com independent_cells=true');
  }
  const allocKeys = Object.keys(allocation).sort();
  if (
    allocKeys.length !== 2 ||
    allocKeys[0] !== 'family' ||
    allocKeys[1] !== 'independent_cells' ||
    allocation.family !== 'uniform-simplex' ||
    allocation.independent_cells !== true
  ) {
    throw new Error('Declare allocation uniform-simplex com independent_cells=true');
  }

  const matricesRaw = validateNonemptyArray(data.matrices, 'matrices');
  if (matricesRaw.length < 2) {
    throw new Error('São necessários pelo menos dois avaliadores (K >= 2)');
  }

  let dims: [number, number, number] | null = null;
  const cleanMatrices: number[][][][] = [];

  for (let k = 0; k < matricesRaw.length; k += 1) {
    const matrixRaw = validateNonemptyArray(matricesRaw[k], `matrix[${k}]`);
    const rows: number[][][] = [];
    for (let i = 0; i < matrixRaw.length; i += 1) {
      const rowRaw = validateNonemptyArray(matrixRaw[i], `matrix[${k}][${i}]`);
      const cells = rowRaw.map((cell, j) => validateBelief(cell, `matrix[${k}][${i}][${j}]`));
      const shape: [number, number, number] = [matrixRaw.length, rowRaw.length, cells[0].length];
      if (dims === null) {
        dims = shape;
      }
      if (
        shape[0] !== dims[0] ||
        shape[1] !== dims[1] ||
        shape[2] !== dims[2] ||
        cells.some((c) => c.length !== dims![2])
      ) {
        throw new Error('Todas as matrizes devem compartilhar formato retangular M x L x N');
      }
      rows.push(cells);
    }
    cleanMatrices.push(rows);
  }

  const [M, L, N] = dims!;
  return {
    matrices: cleanMatrices,
    alpha,
    threshold,
    trials,
    seed,
    allocation: { family: 'uniform-simplex', independent_cells: true },
    dimensions: {
      evaluators: cleanMatrices.length,
      alternatives: M,
      attributes: L,
      grades: N,
    },
  };
}

/**
 * Normalized base-2 Shannon entropy in [0, 1].
 */
export function entropy(p: readonly number[]): number {
  const denom = Math.log2(p.length);
  const terms: number[] = [];
  for (let n = 0; n < p.length; n += 1) {
    const x = p[n];
    if (x > 0) {
      terms.push(x * Math.log2(x));
    }
  }
  const h = -fsum(terms) / denom;
  return h === 0 ? 0 : h;
}

function jsDistanceRaw(p: readonly number[], r: readonly number[]): number {
  const terms: number[] = [];
  for (let n = 0; n < p.length; n += 1) {
    const x = p[n];
    const y = r[n];
    const total = x + y;
    // Log subtraction avoids midpoint underflow for subnormal masses.
    if (x > 0) {
      terms.push(0.5 * x * (1 + Math.log2(x) - Math.log2(total)));
    }
    if (y > 0) {
      terms.push(0.5 * y * (1 + Math.log2(y) - Math.log2(total)));
    }
  }
  const val = Math.sqrt(Math.min(1, Math.max(0, fsum(terms))));
  return val === 0 ? 0 : val;
}

/**
 * Base-2 Jensen-Shannon distance, normalized entropy difference, and alpha-mixture.
 */
export function distances(
  p: readonly number[],
  r: readonly number[],
  alpha: number,
): [number, number, number] {
  const cleanP = validateBelief(p, 'p', true);
  const cleanR = validateBelief(r, 'r', true);
  if (cleanP.length !== cleanR.length) {
    throw new Error('As distribuições devem usar o mesmo conjunto de graus');
  }
  const cleanAlpha = validateNumber(alpha, 'alpha');
  const js = jsDistanceRaw(cleanP, cleanR);
  const hd = Math.abs(entropy(cleanP) - entropy(cleanR));
  const combined = cleanAlpha * js + (1 - cleanAlpha) * hd;
  return [js, hd === 0 ? 0 : hd, combined === 0 ? 0 : combined];
}

/**
 * Eq. (13): evaluator rank-stability weights from complete rank probabilities.
 */
export function weightsFromRankProbabilities(probabilities: readonly (readonly number[])[]): number[] {
  const outer = validateNonemptyArray(probabilities, 'rank probabilities');
  const maxima: number[] = [];
  for (let k = 0; k < outer.length; k += 1) {
    const inner = validateNonemptyArray(outer[k], `rank probabilities[${k}]`);
    const values = inner.map((x) => validateNumber(x, `rank probability[${k}]`));
    if (Math.abs(fsum(values) - 1) > TOLERANCE) {
      throw new Error('As probabilidades de ranking de cada avaliador devem somar 1');
    }
    maxima.push(Math.max(...values));
  }
  const total = fsum(maxima);
  if (total <= 0) {
    throw new Error('A soma dos máximos de estabilidade de ranking deve ser positiva');
  }
  return maxima.map((x) => x / total);
}

/**
 * 95% Wilson score confidence interval for binomial proportions.
 */
export function wilsonInterval(successes: number, trials: number): [number, number] {
  const z = 1.959963984540054;
  const p = successes / trials;
  const denominator = 1 + (z * z) / trials;
  const center = (p + (z * z) / (2 * trials)) / denominator;
  const half =
    (z * Math.sqrt((p * (1 - p)) / trials + (z * z) / (4 * trials * trials))) / denominator;
  return [Math.max(0, center - half), Math.min(1, center + half)];
}

function competitionRanks(utilities: ArrayLike<number>): number[] {
  const mCount = utilities.length;
  const ranks = new Array<number>(mCount);
  for (let i = 0; i < mCount; i += 1) {
    let rank = 1;
    const ui = utilities[i];
    for (let m = 0; m < mCount; m += 1) {
      if (utilities[m] > ui + TIE_TOLERANCE) {
        rank += 1;
      }
    }
    ranks[i] = rank;
  }
  return ranks;
}

function quantileSorted(sorted: Float64Array, p: number): number {
  const n = sorted.length;
  if (n === 0) return 0;
  if (n === 1) return sorted[0];
  const idx = p * (n - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (idx - lo) * (sorted[hi] - sorted[lo]);
}

function clamp01(value: number): number {
  const clamped = Math.min(1, Math.max(0, value));
  return clamped === 0 ? 0 : clamped;
}

interface InternalExtraOptions {
  gradeUtilities: number[];
  attributeWeights: number[];
  sensitivityAlphas: number[];
  sensitivityThresholds: number[];
}

function runSimulation(
  validated: ValidatedConsensusInput,
  extra?: InternalExtraOptions,
): {
  consensus: ConsensusResult;
  extraResult?: Omit<StochasticEvaluationResult, 'consensus'>;
} {
  const { matrices, alpha, threshold, trials: requestedTrials, seed, dimensions } = validated;
  const { evaluators: K, alternatives: M, attributes: L, grades: N } = dimensions;

  const cells: number[][][] = matrices.map((matrix) => {
    const flat: number[][] = [];
    for (let i = 0; i < M; i += 1) {
      for (let j = 0; j < L; j += 1) {
        flat.push(matrix[i][j]);
      }
    }
    return flat;
  });

  const exact = cells.every((matrix) => matrix.every((cell) => fsum(cell) === 1));
  const trials = exact ? 1 : requestedTrials;

  const pairs: Array<[number, number]> = [];
  for (let k = 0; k < K; k += 1) {
    for (let l = k + 1; l < K; l += 1) {
      pairs.push([k, l]);
    }
  }
  const numPairs = pairs.length;
  const ML = M * L;
  const totalPairCells = numPairs * ML;

  const pairSums = Array.from({ length: numPairs }, () => new Float64Array(ML));
  const acceptedSums = Array.from({ length: K }, () =>
    Array.from({ length: ML }, () => new Float64Array(N)),
  );

  const rng = mulberry32(seed);
  let accepted = 0;
  let ciSum = 0;
  let acceptedCiSum = 0;
  let acceptedMean = 0;
  let acceptedM2 = 0;

  // Optional extended evaluation storage
  const evalUtilitiesByDraw = extra ? new Float64Array(trials * K * M) : null;
  const equalUtilitiesByDraw = extra ? new Float64Array(trials * M) : null;
  const evaluatorRankCounts: Array<Map<string, number>> = extra
    ? Array.from({ length: K }, () => new Map<string, number>())
    : [];

  const sensAlphas = extra?.sensitivityAlphas ?? [];
  const sensThresholds = extra?.sensitivityThresholds ?? [];
  const sensAcceptedCounts = extra
    ? Array.from({ length: sensAlphas.length }, () => new Int32Array(sensThresholds.length))
    : null;
  const sensAcceptedMeans = extra
    ? Array.from({ length: sensAlphas.length }, () => new Float64Array(sensThresholds.length))
    : null;
  const sensUnconditionalSum = extra ? new Float64Array(sensAlphas.length) : null;

  const drawJs = extra ? new Float64Array(totalPairCells) : null;
  const drawHd = extra ? new Float64Array(totalPairCells) : null;
  const evalCandU = extra ? new Float64Array(M) : null;

  for (let t = 0; t < trials; t += 1) {
    const completed: number[][][] = new Array(K);
    const entropies: number[][] = new Array(K);
    for (let k = 0; k < K; k += 1) {
      const compMatrix: number[][] = new Array(ML);
      const entMatrix: number[] = new Array(ML);
      for (let c = 0; c < ML; c += 1) {
        const comp = completeBelief(cells[k][c], rng);
        compMatrix[c] = comp;
        entMatrix[c] = entropy(comp);
      }
      completed[k] = compMatrix;
      entropies[k] = entMatrix;
    }

    const allDistances = new Array<number>(totalPairCells);
    let pairCellIdx = 0;
    for (let pIdx = 0; pIdx < numPairs; pIdx += 1) {
      const [k, l] = pairs[pIdx];
      for (let c = 0; c < ML; c += 1) {
        const js = jsDistanceRaw(completed[k][c], completed[l][c]);
        const hd = Math.abs(entropies[k][c] - entropies[l][c]);
        const d = alpha * js + (1 - alpha) * hd;
        pairSums[pIdx][c] += d;
        allDistances[pairCellIdx] = d;
        if (drawJs && drawHd) {
          drawJs[pairCellIdx] = js;
          drawHd[pairCellIdx] = hd;
        }
        pairCellIdx += 1;
      }
    }

    const ci = clamp01(1 - fsum(allDistances) / totalPairCells);
    ciSum += ci;
    if (ci >= threshold) {
      accepted += 1;
      acceptedCiSum += ci;
      const delta = ci - acceptedMean;
      acceptedMean += delta / accepted;
      acceptedM2 += delta * (ci - acceptedMean);
      for (let k = 0; k < K; k += 1) {
        for (let c = 0; c < ML; c += 1) {
          const accCell = acceptedSums[k][c];
          const compCell = completed[k][c];
          for (let n = 0; n < N; n += 1) {
            accCell[n] += compCell[n];
          }
        }
      }
    }

    if (extra && evalUtilitiesByDraw && equalUtilitiesByDraw && evalCandU) {
      const { gradeUtilities: u, attributeWeights: w } = extra;
      const equalOffset = t * M;
      for (let k = 0; k < K; k += 1) {
        const evalOffset = (t * K + k) * M;
        for (let i = 0; i < M; i += 1) {
          let candU = 0;
          for (let j = 0; j < L; j += 1) {
            const cell = completed[k][i * L + j];
            let cellU = 0;
            for (let n = 0; n < N; n += 1) {
              cellU += cell[n] * u[n];
            }
            candU += w[j] * cellU;
          }
          evalCandU[i] = candU;
          evalUtilitiesByDraw[evalOffset + i] = candU;
          equalUtilitiesByDraw[equalOffset + i] += candU / K;
        }
        const rankVec = competitionRanks(evalCandU);
        const key = rankVec.join(',');
        const map = evaluatorRankCounts[k];
        map.set(key, (map.get(key) ?? 0) + 1);
      }

      if (drawJs && drawHd && sensAcceptedCounts && sensAcceptedMeans && sensUnconditionalSum) {
        const sumJs = fsum(drawJs);
        const sumHd = fsum(drawHd);
        for (let aIdx = 0; aIdx < sensAlphas.length; aIdx += 1) {
          const sa = sensAlphas[aIdx];
          const sCi =
            sa === alpha
              ? ci
              : clamp01(1 - (sa * sumJs + (1 - sa) * sumHd) / totalPairCells);
          sensUnconditionalSum[aIdx] += sCi;
          for (let tIdx = 0; tIdx < sensThresholds.length; tIdx += 1) {
            if (sCi >= sensThresholds[tIdx]) {
              const cnt = sensAcceptedCounts[aIdx][tIdx] + 1;
              sensAcceptedCounts[aIdx][tIdx] = cnt;
              const prevMean = sensAcceptedMeans[aIdx][tIdx];
              sensAcceptedMeans[aIdx][tIdx] = prevMean + (sCi - prevMean) / cnt;
            }
          }
        }
      }
    }
  }

  const gcr = accepted / trials;
  let conditionalMatrices: number[][][][] | null = null;
  if (accepted > 0) {
    conditionalMatrices = Array.from({ length: K }, (_, k) =>
      Array.from({ length: M }, (_, i) =>
        Array.from({ length: L }, (_, j) =>
          Array.from(acceptedSums[k][i * L + j], (sumVal) => sumVal / accepted),
        ),
      ),
    );
  }

  const warnings: string[] = [];
  if (alpha === 0) {
    warnings.push(
      'alpha = 0 (distância apenas por entropia): a medida torna-se uma pseudométrica e não distingue distribuições distintas com entropia idêntica (ex.: [1, 0] vs. [0, 1]).',
    );
  }
  if (!exact && accepted === 0) {
    warnings.push(
      'Nenhum sorteio atingiu consenso (accepted_count = 0) nas simulações realizadas; isso não prova que a região de aceitação seja vazia — examine o limite superior de 95%, aumente os sorteios ou clarifique evidências.',
    );
  }
  if (!exact && accepted > 0 && accepted < 30) {
    warnings.push(
      `Poucos sorteios aceitos (${accepted} de ${trials}); estimativas condicionais (EAGCI e matrizes médias condicionais) apresentam maior erro amostral e exigem verificação adicional de precisão.`,
    );
  }

  let conditionalSe: number | null = null;
  if (exact && accepted > 0) {
    conditionalSe = 0;
  } else if (accepted > 1) {
    conditionalSe = Math.sqrt(Math.max(0, acceptedM2) / ((accepted - 1) * accepted));
  }

  const consensus: ConsensusResult = {
    dimensions,
    configuration: {
      alpha,
      threshold,
      trials: requestedTrials,
      seed,
      allocation: { ...ALLOCATION },
      numerical_tolerance: TOLERANCE,
    },
    evaluation_mode: exact ? 'exact_complete_input' : 'monte_carlo',
    evaluations: trials,
    accepted_count: accepted,
    gcr,
    gcr_interval_95: exact ? [gcr, gcr] : wilsonInterval(accepted, trials),
    zero_acceptance_upper_bound_95:
      !exact && accepted === 0 ? -Math.expm1(Math.log(0.05) / trials) : null,
    conditional_mean_ci: accepted > 0 ? acceptedMean : null,
    conditional_mean_ci_mc_se: conditionalSe,
    unconditional_mean_ci: ciSum / trials,
    accepted_contribution: acceptedCiSum / trials,
    conditional_mean_matrices: conditionalMatrices,
    mean_cell_pair_distance: pairs.map(([k, l], pIdx) => ({
      evaluators: [k, l],
      distances: Array.from({ length: M }, (_, i) =>
        Array.from({ length: L }, (_, j) => pairSums[pIdx][i * L + j] / trials),
      ),
    })),
    interpretation:
      'CI médio condicional e matrizes médias interpretam as Eqs. (24)-(25) como esperança condicionada à região aceita; a densidade uniforme no simplex é uma escolha explícita de implementação.',
    warnings,
  };

  if (!extra || !evalUtilitiesByDraw || !equalUtilitiesByDraw) {
    return { consensus };
  }

  const { gradeUtilities: u, attributeWeights: w } = extra;

  // Eq. (13) evaluator rank-stability weights
  const rankProbVectors = evaluatorRankCounts.map((map) =>
    Array.from(map.values(), (count) => count / trials),
  );
  const evaluatorMaxRankProbabilities = rankProbVectors.map((probs) => Math.max(...probs));
  const evaluatorWeightsRankStability = weightsFromRankProbabilities(rankProbVectors);
  const evaluatorEqualWeights = Array.from({ length: K }, () => 1 / K);

  // Compute rank-weighted utilities across the same draws
  const rwUtilitiesByDraw = new Float64Array(trials * M);
  for (let t = 0; t < trials; t += 1) {
    const rwOffset = t * M;
    for (let k = 0; k < K; k += 1) {
      const lam = evaluatorWeightsRankStability[k];
      const evalOffset = (t * K + k) * M;
      for (let i = 0; i < M; i += 1) {
        rwUtilitiesByDraw[rwOffset + i] += lam * evalUtilitiesByDraw[evalOffset + i];
      }
    }
  }

  // Accumulate rank probabilities, expected ranks, and tie rates for equal and rank-weighted
  const rankProbsEqual = Array.from({ length: M }, () => new Float64Array(M));
  const rankProbsRw = Array.from({ length: M }, () => new Float64Array(M));
  const expectedRankEqualSum = new Float64Array(M);
  const expectedRankRwSum = new Float64Array(M);
  const tieCountEqual = new Int32Array(M);
  const tieCountRw = new Int32Array(M);

  const sliceEqual = new Float64Array(M);
  const sliceRw = new Float64Array(M);

  for (let t = 0; t < trials; t += 1) {
    const offset = t * M;
    for (let i = 0; i < M; i += 1) {
      sliceEqual[i] = equalUtilitiesByDraw[offset + i];
      sliceRw[i] = rwUtilitiesByDraw[offset + i];
    }

    const rEqual = competitionRanks(sliceEqual);
    const rRw = competitionRanks(sliceRw);

    const freqEqual = new Int32Array(M + 1);
    const freqRw = new Int32Array(M + 1);
    for (let i = 0; i < M; i += 1) {
      freqEqual[rEqual[i]] += 1;
      freqRw[rRw[i]] += 1;
    }

    for (let i = 0; i < M; i += 1) {
      const re = rEqual[i];
      const rrw = rRw[i];
      rankProbsEqual[i][re - 1] += 1 / trials;
      rankProbsRw[i][rrw - 1] += 1 / trials;
      expectedRankEqualSum[i] += re;
      expectedRankRwSum[i] += rrw;
      if (freqEqual[re] > 1) tieCountEqual[i] += 1;
      if (freqRw[rrw] > 1) tieCountRw[i] += 1;
    }
  }

  // Per-candidate utility distributions, quantiles, and original ignorance bounds
  const candidates: CandidateEvaluationResult[] = new Array(M);
  const candEqualDraws = new Float64Array(trials);
  const candRwDraws = new Float64Array(trials);

  for (let i = 0; i < M; i += 1) {
    let sumEq = 0;
    let sumRw = 0;
    for (let t = 0; t < trials; t += 1) {
      const uEq = equalUtilitiesByDraw[t * M + i];
      const uRw = rwUtilitiesByDraw[t * M + i];
      candEqualDraws[t] = uEq;
      candRwDraws[t] = uRw;
      sumEq += uEq;
      sumRw += uRw;
    }
    candEqualDraws.sort();
    candRwDraws.sort();

    // Original incomplete matrix bounds (Eqs. 1-4 aggregated over attributes and equal evaluators)
    let igMinSum = 0;
    let igMaxSum = 0;
    let weightedIgSum = 0;
    let unweightedIgSum = 0;
    for (let k = 0; k < K; k += 1) {
      for (let j = 0; j < L; j += 1) {
        const cell = matrices[k][i][j];
        const q = Math.max(0, 1 - fsum(cell));
        let assignedU = 0;
        for (let n = 0; n < N; n += 1) {
          assignedU += cell[n] * u[n];
        }
        igMinSum += (w[j] / K) * (assignedU + q * u[0]);
        igMaxSum += (w[j] / K) * (assignedU + q * u[N - 1]);
        weightedIgSum += (w[j] / K) * q;
        unweightedIgSum += q / (K * L);
      }
    }

    let condUtilEqual: number | null = null;
    let condUtilRw: number | null = null;
    if (conditionalMatrices) {
      let cEq = 0;
      let cRw = 0;
      for (let k = 0; k < K; k += 1) {
        const lam = evaluatorWeightsRankStability[k];
        let evalU = 0;
        for (let j = 0; j < L; j += 1) {
          const cell = conditionalMatrices[k][i][j];
          let cellU = 0;
          for (let n = 0; n < N; n += 1) {
            cellU += cell[n] * u[n];
          }
          evalU += w[j] * cellU;
        }
        cEq += evalU / K;
        cRw += lam * evalU;
      }
      condUtilEqual = cEq;
      condUtilRw = cRw;
    }

    candidates[i] = {
      index: i,
      meanUtilityEqual: sumEq / trials,
      utilityP05: quantileSorted(candEqualDraws, 0.05),
      utilityP95: quantileSorted(candEqualDraws, 0.95),
      rankProbabilitiesEqual: Array.from(rankProbsEqual[i]),
      expectedRankEqual: expectedRankEqualSum[i] / trials,
      tieRate: tieCountEqual[i] / trials,
      ignoranceUtilityMin: igMinSum,
      ignoranceUtilityMax: igMaxSum,
      meanIgnorance: weightedIgSum,
      unweightedMeanIgnorance: unweightedIgSum,
      meanUtilityRankWeighted: sumRw / trials,
      rankProbabilitiesRankWeighted: Array.from(rankProbsRw[i]),
      expectedRankRankWeighted: expectedRankRwSum[i] / trials,
      utilityP05RankWeighted: quantileSorted(candRwDraws, 0.05),
      utilityP95RankWeighted: quantileSorted(candRwDraws, 0.95),
      tieRateRankWeighted: tieCountRw[i] / trials,
      conditionalMeanUtilityEqual: condUtilEqual,
      conditionalMeanUtilityRankWeighted: condUtilRw,
    };
  }

  const sensitivityGrid: SensitivityGrid = {
    alphas: [...sensAlphas],
    thresholds: [...sensThresholds],
    cells: sensAlphas.map((sa, aIdx) => {
      const uncondMean = sensUnconditionalSum![aIdx] / trials;
      return sensThresholds.map((st, tIdx) => {
        const acc = sensAcceptedCounts![aIdx][tIdx];
        return {
          alpha: sa,
          threshold: st,
          gcr: acc / trials,
          acceptedCount: acc,
          conditionalMeanCi: acc > 0 ? sensAcceptedMeans![aIdx][tIdx] : null,
          unconditionalMeanCi: uncondMean,
        };
      });
    }),
  };

  return {
    consensus,
    extraResult: {
      evaluatorWeightsRankStability,
      evaluatorMaxRankProbabilities,
      evaluatorEqualWeights,
      gradeUtilities: [...u],
      attributeWeights: [...w],
      candidates,
      sensitivityGrid,
      rankingMethodologyNote: RANKING_METHODOLOGY_NOTE,
    },
  };
}

/**
 * Core Dai et al. (2025) stochastic belief consensus analysis (parity with consensus.py).
 */
export function analyzeConsensus(data: ConsensusInput): ConsensusResult {
  const validated = validateInput(data);
  return runSimulation(validated).consensus;
}

function validateGradeUtilities(
  gradeUtilities: readonly number[] | undefined,
  grades: number,
): number[] {
  if (gradeUtilities === undefined) {
    return Array.from({ length: grades }, (_, n) => n / (grades - 1));
  }
  if (!Array.isArray(gradeUtilities) || gradeUtilities.length !== grades) {
    throw new Error(`gradeUtilities deve ter comprimento exatamente ${grades}`);
  }
  const clean = gradeUtilities.map((val, n) => validateNumber(val, `gradeUtilities[${n}]`));
  for (let n = 1; n < clean.length; n += 1) {
    if (clean[n] <= clean[n - 1]) {
      throw new Error('gradeUtilities deve ser estritamente crescente em [0, 1]');
    }
  }
  return clean;
}

function validateAttributeWeights(
  attributeWeights: readonly number[] | undefined,
  attributes: number,
): number[] {
  if (attributeWeights === undefined) {
    return Array.from({ length: attributes }, () => 1 / attributes);
  }
  if (!Array.isArray(attributeWeights) || attributeWeights.length !== attributes) {
    throw new Error(`attributeWeights deve ter comprimento exatamente ${attributes}`);
  }
  const clean = attributeWeights.map((val, j) => {
    if (typeof val !== 'number' || !Number.isFinite(val) || val < 0) {
      throw new Error(`attributeWeights[${j}] deve ser um número finito não negativo`);
    }
    return val;
  });
  const total = fsum(clean);
  if (total <= 0) {
    throw new Error('A soma de attributeWeights deve ser estritamente positiva');
  }
  return clean.map((val) => val / total);
}

function validateParameterGrid(
  values: readonly number[] | undefined,
  fallback: readonly number[],
  label: string,
): number[] {
  if (values === undefined) {
    return [...fallback];
  }
  const arr = validateNonemptyArray(values, label);
  return arr.map((val, idx) => validateNumber(val, `${label}[${idx}]`));
}

/**
 * Extended stochastic consensus, candidate utility/ranking, Eq. (13) rank-stability
 * weights, ignorance bounds, and paired-draw (alpha x threshold) sensitivity analysis.
 */
export function analyzeStochasticEvaluation(
  params: StochasticEvaluationParams,
): StochasticEvaluationResult {
  const validated = validateInput(params.input);
  const { attributes: L, grades: N } = validated.dimensions;
  const gradeUtilities = validateGradeUtilities(params.gradeUtilities, N);
  const attributeWeights = validateAttributeWeights(params.attributeWeights, L);
  const sensitivityAlphas = validateParameterGrid(
    params.sensitivityAlphas,
    DEFAULT_SENSITIVITY_ALPHAS,
    'sensitivityAlphas',
  );
  const sensitivityThresholds = validateParameterGrid(
    params.sensitivityThresholds,
    DEFAULT_SENSITIVITY_THRESHOLDS,
    'sensitivityThresholds',
  );

  const { consensus, extraResult } = runSimulation(validated, {
    gradeUtilities,
    attributeWeights,
    sensitivityAlphas,
    sensitivityThresholds,
  });

  return {
    consensus,
    ...extraResult!,
  };
}

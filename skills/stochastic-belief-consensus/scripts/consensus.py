"""Auditable stochastic consensus; independent uniform-simplex completions.

Implements Dai et al. (2025), Eqs. 14-22 and 26, with the disclosed
conditional interpretation of Eqs. 24-25. Does not implement ER or optimization.
"""

import argparse
import itertools
import json
import math
from pathlib import Path
import platform
import random
import sys

TOLERANCE = 1e-10
ALLOCATION = {"family": "uniform-simplex", "independent_cells": True}


def number(value, label, low=0.0, high=1.0):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"{label} must be a finite number")
    try:
        value = float(value)
    except OverflowError as exc:
        raise ValueError(f"{label} must be finite") from exc
    if not math.isfinite(value) or not low <= value <= high:
        raise ValueError(f"{label} must be finite and in [{low}, {high}]")
    return value


def nonempty_list(value, label):
    if not isinstance(value, list) or not value:
        raise ValueError(f"{label} must be a nonempty list")
    return value


def belief(value, label="belief", complete=False):
    nonempty_list(value, label)
    if len(value) < 2:
        raise ValueError(f"{label} requires at least two grades")
    result = [number(x, f"{label}[{n}]") for n, x in enumerate(value)]
    total = math.fsum(result)
    if total > 1 + TOLERANCE:
        raise ValueError(f"{label} sums to more than one")
    if complete and abs(total - 1) > TOLERANCE:
        raise ValueError(f"{label} must sum to one")
    if total > 1 or (complete and total != 1):
        result = [x / total for x in result]
    return result


def validate_input(data):
    required = {"matrices", "alpha", "threshold", "trials", "seed", "allocation"}
    if not isinstance(data, dict) or set(data) != required:
        raise ValueError("Input must contain exactly: " + ", ".join(sorted(required)))
    alpha = number(data["alpha"], "alpha")
    threshold = number(data["threshold"], "threshold")
    trials, seed = data["trials"], data["seed"]
    if type(trials) is not int or trials < 1:
        raise ValueError("trials must be a positive integer")
    if type(seed) is not int or seed < 0:
        raise ValueError("seed must be a nonnegative integer")
    allocation = data["allocation"]
    if (not isinstance(allocation, dict) or set(allocation) != set(ALLOCATION)
            or allocation.get("family") != "uniform-simplex"
            or allocation.get("independent_cells") is not True):
        raise ValueError("Declare uniform-simplex allocation with independent_cells=true")
    matrices = nonempty_list(data["matrices"], "matrices")
    if len(matrices) < 2:
        raise ValueError("At least two evaluators are required")
    dimensions = None
    clean = []
    for k, matrix in enumerate(matrices):
        nonempty_list(matrix, f"matrix[{k}]")
        rows = []
        for i, row in enumerate(matrix):
            nonempty_list(row, f"matrix[{k}][{i}]")
            cells = [belief(cell, f"matrix[{k}][{i}][{j}]")
                     for j, cell in enumerate(row)]
            shape = (len(matrix), len(row), len(cells[0]))
            if dimensions is None:
                dimensions = shape
            if shape != dimensions or any(len(c) != dimensions[2] for c in cells):
                raise ValueError("Matrices must share a rectangular M x L x N shape")
            rows.append(cells)
        clean.append(rows)
    return clean, alpha, threshold, trials, seed


def _entropy(p):
    return -math.fsum(x * math.log2(x) for x in p if x > 0) / math.log2(len(p))


def _js_distance(p, r):
    terms = []
    for x, y in zip(p, r):
        total = x + y
        # Log subtraction avoids midpoint underflow for subnormal masses.
        if x > 0:
            terms.append(0.5 * x * (1 + math.log2(x) - math.log2(total)))
        if y > 0:
            terms.append(0.5 * y * (1 + math.log2(y) - math.log2(total)))
    return math.sqrt(min(1.0, max(0.0, math.fsum(terms))))


def distances(p, r, alpha):
    """Return JS distance, normalized entropy difference, and their mixture."""
    p, r = belief(p, "p", complete=True), belief(r, "r", complete=True)
    if len(p) != len(r):
        raise ValueError("Distributions must use the same grade set")
    alpha = number(alpha, "alpha")
    js, hd = _js_distance(p, r), abs(_entropy(p) - _entropy(r))
    return js, hd, alpha * js + (1 - alpha) * hd


def complete_belief(b, rng):
    """Complete a validated cell without modifying assigned belief mass."""
    ignorance = max(0.0, 1 - math.fsum(b))
    if ignorance == 0:
        return list(b)
    while True:
        draws = [rng.expovariate(1.0) for _ in b]
        total = math.fsum(draws)
        if total > 0:
            return [x + ignorance * z / total for x, z in zip(b, draws)]


def weights_from_rank_probabilities(probabilities):
    """Eq. 13 from probabilities of distinct complete rank vectors."""
    nonempty_list(probabilities, "rank probabilities")
    maxima = []
    for k, values in enumerate(probabilities):
        nonempty_list(values, f"rank probabilities[{k}]")
        values = [number(x, f"rank probability[{k}]") for x in values]
        if abs(math.fsum(values) - 1) > TOLERANCE:
            raise ValueError("Each evaluator's rank probabilities must sum to one")
        maxima.append(max(values))
    total = math.fsum(maxima)
    return [x / total for x in maxima]


def wilson_interval(successes, trials):
    z = 1.959963984540054
    p = successes / trials
    denominator = 1 + z * z / trials
    center = (p + z * z / (2 * trials)) / denominator
    half = z * math.sqrt(p * (1 - p) / trials + z * z / (4 * trials * trials)) / denominator
    return [max(0.0, center - half), min(1.0, center + half)]


def analyze(data):
    matrices, alpha, threshold, requested_trials, seed = validate_input(data)
    K, M, L, N = len(matrices), len(matrices[0]), len(matrices[0][0]), len(matrices[0][0][0])
    cells = [[cell for row in matrix for cell in row] for matrix in matrices]
    exact = all(math.fsum(cell) == 1 for matrix in cells for cell in matrix)
    trials = 1 if exact else requested_trials
    pairs = list(itertools.combinations(range(K), 2))
    pair_sums = [[0.0] * (M * L) for _ in pairs]
    accepted_sums = [[[0.0] * N for _ in range(M * L)] for _ in range(K)]
    rng = random.Random(seed)
    accepted = 0
    ci_sum = 0.0
    accepted_ci_sum = 0.0
    accepted_mean = 0.0
    accepted_m2 = 0.0
    for _ in range(trials):
        completed = [[complete_belief(cell, rng) for cell in matrix] for matrix in cells]
        entropies = [[_entropy(cell) for cell in matrix] for matrix in completed]
        all_distances = []
        for pair_index, (k, l) in enumerate(pairs):
            for c in range(M * L):
                d = (alpha * _js_distance(completed[k][c], completed[l][c])
                     + (1 - alpha) * abs(entropies[k][c] - entropies[l][c]))
                pair_sums[pair_index][c] += d
                all_distances.append(d)
        ci = min(1.0, max(0.0, 1 - math.fsum(all_distances) / (len(pairs) * M * L)))
        ci_sum += ci
        if ci >= threshold:
            accepted += 1
            accepted_ci_sum += ci
            delta = ci - accepted_mean
            accepted_mean += delta / accepted
            accepted_m2 += delta * (ci - accepted_mean)
            for k in range(K):
                for c in range(M * L):
                    for n in range(N):
                        accepted_sums[k][c][n] += completed[k][c][n]
    gcr = accepted / trials
    conditional_matrices = None
    if accepted:
        conditional_matrices = [
            [[ [x / accepted for x in accepted_sums[k][i * L + j]]
               for j in range(L)] for i in range(M)] for k in range(K)]
    warnings = []
    if alpha == 0:
        warnings.append("Entropy-only distance cannot distinguish distributions with equal entropy.")
    if not exact and not accepted:
        warnings.append("No consensus observed; this is not proof that the acceptance region is empty.")
    if not exact and 0 < accepted < 30:
        warnings.append("Few accepted draws; conditional estimates require additional precision checks.")
    conditional_se = None
    if exact and accepted:
        conditional_se = 0.0
    elif accepted > 1:
        conditional_se = math.sqrt(max(0.0, accepted_m2) / ((accepted - 1) * accepted))
    return {
        "dimensions": {"evaluators": K, "alternatives": M, "attributes": L, "grades": N},
        "configuration": {"alpha": alpha, "threshold": threshold, "trials": requested_trials,
                          "seed": seed, "allocation": dict(ALLOCATION),
                          "numerical_tolerance": TOLERANCE, "python_version": platform.python_version()},
        "evaluation_mode": "exact_complete_input" if exact else "monte_carlo",
        "evaluations": trials,
        "accepted_count": accepted,
        "gcr": gcr,
        "gcr_interval_95": [gcr, gcr] if exact else wilson_interval(accepted, trials),
        "zero_acceptance_upper_bound_95":
            -math.expm1(math.log(0.05) / trials) if not exact and not accepted else None,
        "conditional_mean_ci": accepted_mean if accepted else None,
        "conditional_mean_ci_mc_se": conditional_se,
        "unconditional_mean_ci": ci_sum / trials,
        "accepted_contribution": accepted_ci_sum / trials,
        "conditional_mean_matrices": conditional_matrices,
        "mean_cell_pair_distance": [
            {"evaluators": [k, l],
             "distances": [[pair_sums[p][i * L + j] / trials for j in range(L)] for i in range(M)]}
            for p, (k, l) in enumerate(pairs)],
        "interpretation": "Conditional mean CI and matrices interpret Eqs. 24-25; density is an implementation choice.",
        "warnings": warnings,
    }


def reject_constant(value):
    raise ValueError(f"Nonfinite JSON constant is not allowed: {value}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    try:
        data = json.loads(args.input.read_text(encoding="utf-8-sig"), parse_constant=reject_constant)
        output = json.dumps(analyze(data), indent=2, allow_nan=False) + "\n"
        if args.output:
            with args.output.open("x", encoding="utf-8") as handle:
                handle.write(output)
        else:
            print(output, end="")
    except (OSError, ValueError, RecursionError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())

"""Mathematical and input-handling invariants, not application validation."""

from copy import deepcopy
import json
import math
from pathlib import Path
import random
import subprocess
import sys
import tempfile
import unittest

from consensus import analyze, complete_belief, distances, validate_input, weights_from_rank_probabilities


def config(matrices, alpha=0.5, threshold=0.8, trials=100):
    return {"matrices": matrices, "alpha": alpha, "threshold": threshold,
            "trials": trials, "seed": 42,
            "allocation": {"family": "uniform-simplex", "independent_cells": True}}


class ConsensusTests(unittest.TestCase):
    def test_extreme_js_and_entropy_degeneracy(self):
        self.assertEqual(distances([1, 0], [0, 1], 1), (1, 0, 1))
        self.assertEqual(distances([1, 0], [0, 1], 0), (1, 0, 0))

    def test_identity_symmetry_and_entropy(self):
        p, q = [0.1, 0.2, 0.7], [0.3, 0.3, 0.4]
        self.assertEqual(distances(p, p, 0.4), (0, 0, 0))
        for a, b in zip(distances(p, q, 0.4), distances(q, p, 0.4)):
            self.assertAlmostEqual(a, b)
        self.assertAlmostEqual(distances([1, 0], [0.5, 0.5], 0)[1], 1)

    def test_subnormal_mass_and_triangle_inequality(self):
        self.assertTrue(all(math.isfinite(x) for x in distances([5e-324, 1], [0, 1], 0.5)))
        p, q, r = [0.1, 0.2, 0.7], [0.3, 0.3, 0.4], [0.8, 0.1, 0.1]
        self.assertLessEqual(distances(p, r, 0.5)[2],
                             distances(p, q, 0.5)[2] + distances(q, r, 0.5)[2] + 1e-12)

    def test_complete_agreement_exact(self):
        result = analyze(config([[[[0.25, 0.75]]], [[[0.25, 0.75]]]], threshold=1))
        self.assertEqual(result["evaluations"], 1)
        self.assertEqual(result["gcr_interval_95"], [1, 1])
        self.assertEqual(result["conditional_mean_ci"], 1)
        self.assertEqual(result["conditional_mean_ci_mc_se"], 0)

    def test_complete_disagreement_exact(self):
        result = analyze(config([[[[1, 0]]], [[[0, 1]]]], alpha=1))
        self.assertEqual(result["gcr_interval_95"], [0, 0])
        self.assertIsNone(result["conditional_mean_ci"])
        self.assertIsNone(result["conditional_mean_matrices"])
        self.assertEqual(result["unconditional_mean_ci"], 0)

    def test_zero_threshold_accepts_zero_consensus(self):
        result = analyze(config([[[[1, 0]]], [[[0, 1]]]], alpha=1, threshold=0))
        self.assertEqual(result["gcr"], 1)
        self.assertEqual(result["conditional_mean_ci"], 0)

    def test_completion_preserves_mass(self):
        rng = random.Random(19)
        for _ in range(100):
            p = complete_belief([0.1, 0.5, 0.2], rng)
            self.assertAlmostEqual(math.fsum(p), 1)
            self.assertTrue(all(x >= y for x, y in zip(p, [0.1, 0.5, 0.2])))
        self.assertEqual(complete_belief([1, 0], rng), [1, 0])

    def test_sampler_moments(self):
        rng = random.Random(9)
        draws = [complete_belief([0, 0, 0], rng) for _ in range(6000)]
        mean = math.fsum(p[0] for p in draws) / len(draws)
        variance = math.fsum((p[0] - mean) ** 2 for p in draws) / len(draws)
        self.assertAlmostEqual(mean, 1 / 3, delta=0.012)
        self.assertAlmostEqual(variance, 1 / 18, delta=0.006)

    def test_synthetic_conditional_estimates(self):
        path = Path(__file__).resolve().parents[1] / "references" / "synthetic-input.json"
        data = json.loads(path.read_text(encoding="utf-8"))
        data["trials"] = 300
        data["threshold"] = 0.88
        before = deepcopy(data)
        result = analyze(data)
        self.assertEqual(data, before)
        self.assertEqual(result, analyze(data))
        self.assertGreater(result["accepted_count"], 0)
        self.assertLess(result["accepted_count"], result["evaluations"])
        self.assertLessEqual(result["gcr"], 1)
        self.assertGreaterEqual(result["conditional_mean_ci"], data["threshold"])
        self.assertLessEqual(result["conditional_mean_ci"], 1)
        self.assertAlmostEqual(result["accepted_contribution"],
                               result["gcr"] * result["conditional_mean_ci"])
        for matrix in result["conditional_mean_matrices"]:
            for row in matrix:
                for cell in row:
                    self.assertAlmostEqual(math.fsum(cell), 1)

    def test_zero_acceptance_stochastic_bound(self):
        data = config([[[[0.99, 0]]], [[[0, 0.99]]]], alpha=1, threshold=0.9)
        result = analyze(data)
        self.assertEqual(result["gcr"], 0)
        self.assertIsNone(result["conditional_mean_ci"])
        self.assertGreater(result["gcr_interval_95"][1], 0)
        self.assertAlmostEqual(result["zero_acceptance_upper_bound_95"], 1 - 0.05 ** 0.01)

    def test_pair_and_cell_averaging(self):
        result = analyze(config([[[[1, 0], [1, 0]]], [[[1, 0], [0, 1]]],
                                 [[[0, 1], [0, 1]]]], alpha=1, threshold=0))
        self.assertAlmostEqual(result["unconditional_mean_ci"], 1 / 3)
        self.assertEqual(len(result["mean_cell_pair_distance"]), 3)

    def test_rank_weights(self):
        result = weights_from_rank_probabilities([[0.8, 0.2], [0.6, 0.4]])
        self.assertAlmostEqual(result[0], 4 / 7)
        self.assertAlmostEqual(result[1], 3 / 7)
        self.assertEqual(weights_from_rank_probabilities([[1], [1]]), [0.5, 0.5])
        with self.assertRaises(ValueError):
            weights_from_rank_probabilities([[0.8, 0.3]])

    def test_bad_inputs(self):
        base = config([[[[1, 0]]], [[[1, 0]]]])
        bad_values = [("alpha", float("nan")), ("threshold", 1.1), ("trials", True),
                      ("trials", 0), ("seed", -1), ("seed", 1.2),
                      ("allocation", {"family": "uniform-simplex", "independent_cells": 1}),
                      ("matrices", [[[[1, 0]]]]), ("matrices", []),
                      ("matrices", [[[[0.7, 0.7]]], [[[1, 0]]]]),
                      ("matrices", [[[[1, 0]]], [[[1, -0.1]]]]),
                      ("matrices", [[[[1, 0]]], [[[1, 0, 0]]]]),
                      ("matrices", [[[[1, 0]]], [[[1, float("inf")]]]]),
                      ("matrices", [[[[1, 0]]], [[[0.5, 0.5]], [[1, 0]]]])]
        for field, value in bad_values:
            with self.subTest(field=field, value=value), self.assertRaises(ValueError):
                validate_input({**base, field: value})
        with self.assertRaises(ValueError):
            distances([0.2, 0.2], [1, 0], 0.5)

    def test_cli_errors_and_no_overwrite(self):
        script = Path(__file__).with_name("consensus.py")
        with tempfile.TemporaryDirectory() as directory:
            input_path = Path(directory) / "input.json"
            output_path = Path(directory) / "output.json"
            input_path.write_text('{"alpha": NaN}', encoding="utf-8")
            command = [sys.executable, "-B", str(script), str(input_path), "--output", str(output_path)]
            invalid = subprocess.run(command, capture_output=True, text=True)
            self.assertEqual(invalid.returncode, 2)
            self.assertFalse(output_path.exists())
            self.assertIn("Nonfinite", invalid.stderr)
            input_path.write_text(json.dumps(config([[[[1, 0]]], [[[1, 0]]]])), encoding="utf-8")
            valid = subprocess.run(command, capture_output=True, text=True)
            self.assertEqual(valid.returncode, 0, valid.stderr)
            self.assertEqual(json.loads(output_path.read_text())["gcr"], 1)
            original = output_path.read_bytes()
            repeat = subprocess.run(command, capture_output=True, text=True)
            self.assertEqual(repeat.returncode, 2)
            self.assertEqual(output_path.read_bytes(), original)


if __name__ == "__main__":
    unittest.main()

#!/usr/bin/env python3
"""Read-only CLI for heuristic review of test source text."""
import argparse
from metrics_calculator import MetricsCalculator
from utility_cli import run_analysis


def analyze(source, args):
    metrics = MetricsCalculator().calculate_test_quality(source)
    if metrics["total_tests"] == 0:
        metrics["quality_score"] = None
    return {
        "analysis_kind": "heuristic",
        "metrics": metrics,
        "limitations": [
            "Python test definitions are counted structurally; other languages use text patterns.",
            "Definition counts do not expand parametrized tests or prove test-runner discovery.",
            "Assertion, isolation, naming and smell scores are heuristic; inspect findings manually.",
            "A null quality_score means no supported test definitions were found.",
            "Tests were not run. Scores do not establish correctness, independence or effectiveness.",
        ],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", help="UTF-8 test source file, or - for stdin")
    return run_analysis(parser, analyze)


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""Read-only CLI for the bundled heuristic complexity calculator."""
import argparse
from metrics_calculator import MetricsCalculator
from utility_cli import run_analysis


def analyze(source, args):
    return {
        "analysis_kind": "heuristic",
        "metrics": MetricsCalculator().calculate_complexity(source),
        "limitations": [
            "Uses the bundled keyword/indentation heuristics, not a language parser or control-flow graph.",
            "Comments and strings may affect scores; nesting and language constructs may be missed.",
            "Scores are review hints, not formal cyclomatic/cognitive metrics or proof of testability.",
            "No source code was executed.",
        ],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", help="UTF-8 source file, or - for stdin")
    return run_analysis(parser, analyze)


if __name__ == "__main__":
    raise SystemExit(main())

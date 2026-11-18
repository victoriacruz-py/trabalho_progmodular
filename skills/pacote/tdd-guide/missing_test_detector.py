#!/usr/bin/env python3
"""Report observed coverage gaps, without claiming to infer missing requirements."""
import argparse
import json
import math
import xml.etree.ElementTree as ET
from coverage_analyzer import CoverageAnalyzer
from utility_cli import run_analysis


def percentage(value):
    number = float(value)
    if not math.isfinite(number) or not 0 <= number <= 100:
        raise argparse.ArgumentTypeError("threshold must be a finite number from 0 to 100")
    return number


def validate_shape(content, format_type):
    """Reject inputs the bundled parsers would silently discard or overwrite."""
    if format_type == "lcov":
        current = None
        seen = set()
        for raw in content.splitlines():
            line = raw.strip()
            if line.startswith("SF:"):
                if current is not None:
                    raise ValueError("LCOV record is missing end_of_record")
                current = line[3:]
                if not current or current in seen:
                    raise ValueError("LCOV empty/duplicate source path; merge reports before analysis")
                seen.add(current)
            elif line == "end_of_record":
                if current is None:
                    raise ValueError("LCOV end_of_record without SF source path")
                current = None
            elif line.startswith(("DA:", "FNDA:", "BRDA:")) and current is None:
                raise ValueError("LCOV counters require an SF source path")
        if current is not None:
            raise ValueError("LCOV record is missing end_of_record")
    elif format_type == "json":
        data = json.loads(content)
        if not isinstance(data, dict) or not data:
            raise ValueError("Expected an Istanbul/nyc coverage-final.json object")
        for path, item in data.items():
            if not isinstance(item, dict) or not any(key in item for key in ("s", "f", "b")):
                raise ValueError("Expected Istanbul/nyc counters for " + path)
            if item.get("s") and not isinstance(item.get("statementMap"), dict):
                raise ValueError("Istanbul statement counters need statementMap")
            for key in item.get("s", {}):
                if key not in item["statementMap"]:
                    raise ValueError("Istanbul statementMap is incomplete")
    else:
        try:
            root = ET.fromstring(content)
        except ET.ParseError as error:
            raise ValueError("Invalid Cobertura XML: " + str(error)) from error
        if root.tag != "coverage":
            raise ValueError("Expected Cobertura XML; convert JaCoCo or other XML formats first")
        paths = [item.get("filename", item.get("name", "unknown")) for item in root.findall(".//package/classes/class")]
        if len(paths) != len(set(paths)):
            raise ValueError("Duplicate XML source path; merge classes per source file before analysis")


def analyze(content, args):
    analyzer = CoverageAnalyzer()
    format_type = analyzer.detect_format(content) if args.format == "auto" else args.format
    validate_shape(content, format_type)
    data = analyzer.parse_coverage_report(content, format_type)
    if not data:
        raise ValueError("Coverage report contains no supported file records")
    files = []
    any_counters = False
    for path, counters in sorted(data.items()):
        coverage = {}
        below = []
        for category in ("lines", "branches", "functions"):
            values = counters[category]
            for key, hits in values.items():
                if type(hits) is not int or hits < 0:
                    raise ValueError("Coverage counters must be nonnegative integers")
                if category == "lines" and (type(key) is not int or key <= 0):
                    raise ValueError("Coverage line numbers must be positive integers")
            total = len(values)
            covered = sum(hits > 0 for hits in values.values())
            any_counters = any_counters or total > 0
            percent = 100 * covered / total if total else None
            coverage[category] = {"covered": covered, "total": total, "percent": round(percent, 2) if percent is not None else None}
            if percent is not None and percent < args.threshold:
                below.append(category)
        files.append({
            "file": path,
            "coverage": coverage,
            "below_threshold": below,
            "uncovered_lines": sorted(key for key, hits in counters["lines"].items() if hits == 0),
            "uncovered_functions": sorted(key for key, hits in counters["functions"].items() if hits == 0),
            "uncovered_branches": sorted(key for key, hits in counters["branches"].items() if hits == 0),
        })
    if not any_counters:
        raise ValueError("Coverage report contains no measurable counters")
    return {
        "analysis_kind": "reported_coverage",
        "format": format_type,
        "threshold": args.threshold,
        "threshold_met": not any(file["below_threshold"] for file in files),
        "branch_identity": "aggregate_slots_only" if format_type in ("xml", "cobertura") else "report_ids",
        "files": files,
        "limitations": [
            "Only files and counters present in the supplied report are measured; absent files are unknown.",
            "Null coverage means no counters for that category, not zero or full coverage; it does not fail the threshold.",
            "Coverage cannot prove assertions, missing business scenarios, integration behavior or error handling.",
            "Istanbul lines use statement start lines; functions with the same name share one entry in the bundled parser.",
            "Cobertura branch slots preserve aggregate counts, not the identity of the unexecuted condition.",
            "Duplicate source records must be merged by the coverage producer before analysis.",
        ],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", help="UTF-8 coverage report, or - for stdin")
    parser.add_argument("--format", choices=("auto", "lcov", "json", "xml", "cobertura"), default="auto")
    parser.add_argument("--threshold", type=percentage, default=80.0, help="minimum for each measured category in each file (default: 80)")
    parser.add_argument("--fail-under", action="store_true", help="return 1 if a measured category falls below the threshold")
    return run_analysis(parser, analyze)


if __name__ == "__main__":
    raise SystemExit(main())

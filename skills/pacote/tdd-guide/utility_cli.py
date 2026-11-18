"""Shared UTF-8 input and JSON output for the local utility entry points."""
import json
from pathlib import Path
import sys


def read_input(path):
    """Read text only; never import or execute the supplied source."""
    if path == "-":
        return sys.stdin.buffer.read().decode("utf-8-sig")
    return Path(path).read_text(encoding="utf-8-sig")


def run_analysis(parser, analyze):
    """Analyze a file or stdin, emitting JSON; return 2 for invalid input."""
    args = parser.parse_args()
    try:
        result = analyze(read_input(args.input), args)
    except (OSError, UnicodeError, ValueError, KeyError, TypeError, IndexError, AttributeError) as error:
        parser.error(str(error))
    print(json.dumps(result, ensure_ascii=True, indent=2, allow_nan=False))
    return 1 if getattr(args, "fail_under", False) and not result["threshold_met"] else 0

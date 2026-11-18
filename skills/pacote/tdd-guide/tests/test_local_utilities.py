"""Behavioral tests for the locally completed command-line utilities."""
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]


class UtilityTests(unittest.TestCase):
    def run_cli(self, script, content, *options):
        return subprocess.run(
            [sys.executable, "-B", str(ROOT / script), "-", *options],
            input=content, text=True, encoding="utf-8", capture_output=True,
        )

    def result(self, process, code=0):
        self.assertEqual(process.returncode, code, process.stderr)
        return json.loads(process.stdout)

    def test_complexity_reports_branching_as_an_estimate(self):
        straight = self.result(self.run_cli("complexity_analyzer.py", "def f(x):\n    return x\n"))
        branch = self.result(self.run_cli("complexity_analyzer.py", "def f(x):\n    if x:\n        return 1\n    return 0\n"))
        self.assertEqual(branch["analysis_kind"], "heuristic")
        self.assertGreater(branch["metrics"]["cyclomatic_complexity"], straight["metrics"]["cyclomatic_complexity"])
        self.assertTrue(branch["limitations"])

    def test_quality_counts_python_tests_once_and_ignores_references(self):
        source = '''# def test_fake(): pass
message = "def test_string(): pass"
def test_returns_true():
    assert True
async def test_handles_async():
    assert 2 == 2
alias = test_returns_true
'''
        result = self.result(self.run_cli("test_quality_scorer.py", source))
        self.assertEqual(result["metrics"]["total_tests"], 2)
        self.assertEqual(result["metrics"]["total_assertions"], 2)
        self.assertEqual(result["metrics"]["avg_assertions_per_test"], 1)

    def test_quality_no_tests_is_not_a_passing_score(self):
        result = self.result(self.run_cli("test_quality_scorer.py", "value = 42\n"))
        self.assertEqual(result["metrics"]["total_tests"], 0)
        self.assertIsNone(result["metrics"]["quality_score"])

    def test_quality_keeps_javascript_test_support(self):
        result = self.result(self.run_cli("test_quality_scorer.py", 'it("returns one", () => { expect(1).toBe(1); });'))
        self.assertEqual(result["metrics"]["total_tests"], 1)

    def test_source_is_read_without_execution(self):
        with tempfile.TemporaryDirectory() as directory:
            marker = Path(directory) / "should-not-exist"
            content = "from pathlib import Path\nPath(%r).touch()\n" % str(marker)
            self.result(self.run_cli("complexity_analyzer.py", content))
            self.assertFalse(marker.exists())

    def test_file_input_accepts_spaces_and_utf8_bom(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "teste com espaço.py"
            source.write_text("def test_ação():\n    assert True\n", encoding="utf-8-sig")
            process = subprocess.run([sys.executable, "-B", str(ROOT / "test_quality_scorer.py"), str(source)], capture_output=True, text=True, encoding="utf-8")
            self.assertEqual(self.result(process)["metrics"]["total_tests"], 1)

    def test_missing_input_is_an_actionable_error(self):
        for script in ("complexity_analyzer.py", "test_quality_scorer.py", "missing_test_detector.py"):
            with self.subTest(script=script), tempfile.TemporaryDirectory() as directory:
                process = subprocess.run([sys.executable, "-B", str(ROOT / script), str(Path(directory) / "absent")], capture_output=True, text=True)
                self.assertEqual(process.returncode, 2)
                self.assertIn("error:", process.stderr)
                self.assertNotIn("Traceback", process.stderr)

    def test_lcov_lists_observed_gaps_and_threshold_failure(self):
        report = "SF:src/a.py\nDA:1,2\nDA:2,0\nFNDA:0,unused\nBRDA:1,0,0,2\nBRDA:1,0,1,-\nend_of_record\n"
        result = self.result(self.run_cli("missing_test_detector.py", report, "--fail-under"), 1)
        file = result["files"][0]
        self.assertEqual(file["uncovered_lines"], [2])
        self.assertEqual(file["uncovered_functions"], ["unused"])
        self.assertEqual(file["uncovered_branches"], ["1:0:1"])
        self.assertEqual(file["coverage"]["lines"]["percent"], 50)
        self.assertFalse(result["threshold_met"])

    def test_analysis_default_does_not_fail_on_gaps(self):
        result = self.result(self.run_cli("missing_test_detector.py", "SF:a\nDA:1,0\nend_of_record\n"))
        self.assertFalse(result["threshold_met"])

    def test_no_branch_data_does_not_fail_line_only_coverage(self):
        result = self.result(self.run_cli("missing_test_detector.py", "SF:a\nDA:1,1\nend_of_record\n", "--fail-under", "--threshold", "100"))
        self.assertTrue(result["threshold_met"])
        self.assertIsNone(result["files"][0]["coverage"]["branches"]["percent"])

    def test_threshold_equality_passes(self):
        self.result(self.run_cli("missing_test_detector.py", "SF:a\nDA:1,1\nDA:2,0\nend_of_record\n", "--threshold", "50", "--fail-under"))

    def test_unterminated_lcov_is_rejected(self):
        process = self.run_cli("missing_test_detector.py", "SF:a\nDA:1,1\n")
        self.assertEqual(process.returncode, 2)
        self.assertIn("end_of_record", process.stderr)

    def test_repeated_lcov_files_are_not_silently_overwritten(self):
        process = self.run_cli("missing_test_detector.py", "SF:a\nDA:1,1\nend_of_record\nSF:a\nDA:1,0\nend_of_record\n")
        self.assertEqual(process.returncode, 2)
        self.assertIn("duplicate", process.stderr.lower())

    def test_invalid_and_empty_reports_are_rejected(self):
        for content in ("", "nonsense", "{}", "[]", '{"totals":{"covered_lines":4}}', "<coverage/>", "SF:a\nDA:1,-1\nend_of_record\n"):
            with self.subTest(content=content):
                process = self.run_cli("missing_test_detector.py", content)
                self.assertEqual(process.returncode, 2, process.stdout)
                self.assertNotIn("Traceback", process.stderr)

    def test_invalid_threshold_is_rejected(self):
        for threshold in ("-1", "101", "nan", "inf"):
            with self.subTest(threshold=threshold):
                process = self.run_cli("missing_test_detector.py", "SF:a\nDA:1,1\nend_of_record\n", "--threshold", threshold)
                self.assertEqual(process.returncode, 2)

    def test_istanbul_same_line_preserves_observed_execution(self):
        report = json.dumps({"a.js": {"s": {"0": 1, "1": 0}, "statementMap": {"0": {"start": {"line": 1}}, "1": {"start": {"line": 1}}}, "f": {}, "b": {}}})
        result = self.result(self.run_cli("missing_test_detector.py", report, "--format", "json"))
        self.assertEqual(result["files"][0]["coverage"]["lines"]["percent"], 100)

    def test_cobertura_partial_branches_remain_partial(self):
        report = '<coverage><packages><package><classes><class filename="a.py"><lines><line number="1" hits="2" branch="true" condition-coverage="50% (1/2)"/></lines></class></classes></package></packages></coverage>'
        result = self.result(self.run_cli("missing_test_detector.py", report, "--format", "cobertura"))
        branches = result["files"][0]["coverage"]["branches"]
        self.assertEqual(branches, {"covered": 1, "total": 2, "percent": 50.0})
        self.assertEqual(result["branch_identity"], "aggregate_slots_only")

    def test_bundled_sample_report_runs_end_to_end(self):
        content = (ROOT / "sample_coverage_report.lcov").read_text(encoding="utf-8")
        result = self.result(self.run_cli("missing_test_detector.py", content, "--fail-under"))
        self.assertEqual(len(result["files"]), 2)
        self.assertTrue(result["threshold_met"])


if __name__ == "__main__":
    unittest.main()

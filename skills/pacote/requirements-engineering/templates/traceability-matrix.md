# Traceability Matrix

Links every business objective to the requirements, risks, design elements, and tests that serve it, and exposes the gaps.
Pairs with the `requirements-engineering` and `test-engineering` skills. Use at design review, before release, and at audit.

## 1. Metadata

| Field | Value |
|---|---|
| Project / release | `<name>` |
| Author | `<name>` |
| Date | `<YYYY-MM-DD>` |
| Sources | `<specification, conception, test plan, risk register>` |
| Status | `<draft / reviewed>` |

## 2. Identifier Conventions

| Prefix | Meaning | Defined in |
|---|---|---|
| OBJ- | Business objective | `<cahier des charges>` |
| FR- | Functional requirement | `<functional specification>` |
| NFR- | Non-functional requirement | `<functional specification>` |
| BR- | Business rule | `<functional specification>` |
| R- | Risk | `<discovery report / threat model>` |
| D- | Design element | `<technical conception>` |
| TC- | Test case | `<test strategy / test suite>` |

## 3. Forward Trace: Objective to Test

| Objective | Requirement | Risk | Design element | Test ID | Test level | Status |
|---|---|---|---|---|---|---|
| `<OBJ-001>` | `<FR-001>` | `<R-002>` | `<D-004 component>` | `<TC-011>` | `<integration>` | `<passing / failing / not run>` |
| `<OBJ-001>` | `<FR-002>` | `<none identified>` | `<D-005>` | `<TC-014>` | `<E2E>` | `<passing>` |
| `<OBJ-002>` | `<NFR-001>` | `<R-005>` | `<D-009>` | `<TC-030>` | `<performance>` | `<not run>` |
| `<OBJ-002>` | `<BR-001>` | `<R-007>` | `<D-003 enforcement point>` | `<TC-021>` | `<unit>` | `<passing>` |

## 4. Risk Coverage

Every risk scoring 12 or above requires at least one control and one verifying test.

| Risk | Score | Control / mitigation | Design element | Verifying test | Verified |
|---|---|---|---|---|---|
| `<R-001>` | `<16>` | `<control>` | `<D-002>` | `<TC-040>` | `<yes / no>` |

## 5. Coverage Gaps

### 5.1 Requirements with no test

| Requirement | Priority | Reason no test exists | Owner | Resolution date |
|---|---|---|---|---|
| `<FR-007>` | `<Must>` | `<not yet written / deemed untestable>` | `<name>` | `<YYYY-MM-DD>` |

Any Must-priority requirement in this table blocks release.

### 5.2 Tests with no requirement

| Test ID | What it asserts | Verdict | Action |
|---|---|---|---|
| `<TC-052>` | `<behaviour under test>` | `<undocumented requirement / obsolete / duplicate>` | `<add requirement / delete test>` |

An orphan test means either a missing requirement or a test asserting behaviour nobody asked for. Both need a decision.

### 5.3 Requirements with no design element

| Requirement | Status | Owner |
|---|---|---|
| `<FR-009>` | `<not yet designed / handled by existing component and to be confirmed>` | `<name>` |

### 5.4 Risks with no mitigation

| Risk | Score | Decision | Accepted by | Date |
|---|---|---|---|---|
| `<R-011>` | `<9>` | `<accepted / deferred / mitigation planned>` | `<name>` | `<YYYY-MM-DD>` |

## 6. Coverage Summary

| Dimension | Total | Covered | Uncovered | Coverage |
|---|---|---|---|---|
| Objectives with at least one requirement | `<n>` | `<n>` | `<n>` | `<percentage>` |
| Must requirements with at least one test | `<n>` | `<n>` | `<n>` | `<percentage>` |
| Should requirements with at least one test | `<n>` | `<n>` | `<n>` | `<percentage>` |
| Risks scoring 12+ with a verifying test | `<n>` | `<n>` | `<n>` | `<percentage>` |
| Tests linked to a requirement | `<n>` | `<n>` | `<n>` | `<percentage>` |

## 7. Release Gate

| Gate | Condition | Met | Evidence |
|---|---|---|---|
| G1 | Every Must requirement has a passing test | `<yes / no>` | `<test run reference>` |
| G2 | Every risk scoring 12+ has a verified control | `<yes / no>` | `<test or audit reference>` |
| G3 | No orphan test is left undecided | `<yes / no>` | `<review record>` |
| G4 | All accepted gaps are signed off | `<yes / no>` | `<sign-off reference>` |

## 8. Maintenance

| Trigger | Action | Owner |
|---|---|---|
| New requirement added | Add row, assign design element and test | `<role>` |
| Requirement removed | Mark superseded, resolve dependent tests | `<role>` |
| Test deleted | Confirm requirement retains coverage | `<role>` |
| Release cut | Re-run coverage summary and gates | `<role>` |

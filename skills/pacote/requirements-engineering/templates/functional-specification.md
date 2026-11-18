# Functional Specification

Defines what the system must do, in verifiable terms, independent of implementation.
Pairs with the `requirements-engineering` skill. Use once discovery is stable and before technical conception.

## 1. Metadata

| Field | Value |
|---|---|
| System / module | `<name>` |
| Author | `<name>` |
| Date | `<YYYY-MM-DD>` |
| Version | `<1.0>` |
| Status | `<draft / reviewed / approved>` |
| Source documents | `<discovery report, cahier des charges>` |

## 2. Scope Summary

In scope: `<one or two sentences>`
Out of scope: `<one or two sentences>`

## 3. Actors

| Actor | Description | Authentication | Volume |
|---|---|---|---|
| `<role>` | `<who they are, what they do>` | `<mechanism>` | `<count>` |

## 4. Permission Matrix

Columns are actors. Values: C = create, R = read, U = update, D = delete, - = no access.
Ownership qualifiers: `own` = only records the actor owns, `tenant` = only within the actor's tenant.

| Resource | `<Actor A>` | `<Actor B>` | `<Actor C>` | Notes |
|---|---|---|---|---|
| `<resource>` | `<CRUD>` | `<R (tenant)>` | `<->` | `<condition or exception>` |

## 5. Functional Requirements

Priority uses MoSCoW. Every requirement is testable and traces to a business objective.

| ID | Requirement | Actor | Priority | Objective | Acceptance reference |
|---|---|---|---|---|---|
| FR-001 | The system shall `<observable behaviour>` | `<actor>` | `<Must>` | `<OBJ-001>` | `<AC-001>` |
| FR-002 | The system shall `<observable behaviour>` | `<actor>` | `<Should>` | `<OBJ-001>` | `<AC-002>` |

## 6. Business Rules

Rules constrain behaviour across several requirements. Each rule is stated so it can be checked in isolation.

| ID | Rule | Applies to | Enforcement point | Violation behaviour |
|---|---|---|---|---|
| BR-001 | `<invariant or constraint>` | `<FR-001, FR-004>` | `<where enforced>` | `<error, rejection, correction>` |

## 7. Use Case Index

| ID | Use case | Primary actor | Related requirements | Detail document |
|---|---|---|---|---|
| UC-001 | `<name>` | `<actor>` | `<FR-001, FR-002>` | `<use-case.md instance>` |

## 8. Exception Paths

Exception handling is specified, not left to implementation choice.

| ID | Trigger condition | Affected use case | System response | User-visible outcome | Recovery |
|---|---|---|---|---|---|
| EX-001 | `<invalid input>` | `<UC-001>` | `<reject, log>` | `<message shown>` | `<retry allowed>` |
| EX-002 | `<unauthorised actor>` | `<UC-001>` | `<deny, audit>` | `<generic denial>` | `<none>` |
| EX-003 | `<dependency unavailable>` | `<UC-002>` | `<queue or fail fast>` | `<status shown>` | `<automatic retry policy>` |
| EX-004 | `<concurrent modification>` | `<UC-002>` | `<detect conflict>` | `<conflict notice>` | `<reload and reapply>` |

## 9. Data Requirements

| Entity | Key attributes | Owner | Required at | Validation rules |
|---|---|---|---|---|
| `<entity>` | `<attributes>` | `<actor or system>` | `<use case>` | `<format, range, uniqueness>` |

## 10. Non-Functional Requirements Referenced

| ID | Category | Requirement | Threshold | Verified by |
|---|---|---|---|---|
| NFR-001 | `<performance>` | `<statement>` | `<measurable value>` | `<test or measurement>` |

## 11. Acceptance Criteria

Each criterion is written Given / When / Then and maps to one or more requirements.

| ID | Requirement | Given | When | Then | Type |
|---|---|---|---|---|---|
| AC-001 | `<FR-001>` | `<precondition>` | `<action>` | `<observable result>` | `<happy path>` |
| AC-002 | `<FR-001>` | `<precondition>` | `<invalid action>` | `<rejection and message>` | `<negative>` |
| AC-003 | `<FR-001>` | `<boundary state>` | `<action at limit>` | `<defined behaviour>` | `<boundary>` |
| AC-004 | `<FR-001>` | `<actor lacking permission>` | `<action>` | `<denied, audited>` | `<authorization>` |

## 12. Assumptions

| ID | Assumption | Impact if false | Owner |
|---|---|---|---|
| A-001 | `<assumption>` | `<affected requirements>` | `<name>` |

## 13. Open Questions

| ID | Question | Blocks | Decision owner | Needed by |
|---|---|---|---|---|
| Q-001 | `<question>` | `<FR-003>` | `<name>` | `<YYYY-MM-DD>` |

## 14. Change Log

| Version | Date | Author | Change |
|---|---|---|---|
| `<1.0>` | `<YYYY-MM-DD>` | `<name>` | `<initial version>` |

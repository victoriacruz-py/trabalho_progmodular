# Requirement quality checklist

Run this as a review pass over every requirement before it reaches implementation.
A requirement that fails any check is rewritten, not annotated.

## Per-requirement checks

| Check | Question | Failure looks like |
|---|---|---|
| Atomic | Does it describe exactly one behavior? | "and" or "or" joining two outcomes |
| Testable | Can a test fail it? | "user-friendly", "robust", "efficient" |
| Unambiguous | Can two engineers read it two ways? | "appropriate", "as needed", "etc." |
| Complete | Are all paths defined, including failure? | Only the happy path is described |
| Consistent | Does it contradict another requirement? | Two rules on the same object disagree |
| Necessary | Does removing it lose business value? | Requirement traces to no objective |
| Implementation-free | Does it name tables, classes, or libraries? | "Insert a row into orders_tmp" |
| Bounded | Are limits, sizes and timeouts stated? | "uploads a file" with no maximum size |
| Traced | Does it link to an objective and a test? | Orphan requirement |

## Ambiguity words to hunt

Search the document for these. Each occurrence is either quantified or turned into an open question.

fast, slow, quick, efficient, scalable, robust, secure, user-friendly, intuitive, simple,
flexible, appropriate, reasonable, sufficient, as needed, if necessary, where possible,
should normally, usually, handle, support, manage, process, etc., and/or, TBD. <!-- placeholder-check: allow -->

The words handle, support, manage and process are the most dangerous, because they read as
specific while committing to nothing. "The system handles failed payments" defines no behavior.

## Common defects and their repair

**Compound requirement.**
Broken: "The user can upload, preview and delete attachments."
Repair: three requirements, because each has its own permissions, limits and failure modes.

**Solution stated as requirement.**
Broken: "The system uses Redis to cache invoice lists."
Repair: state the need ("NFR: invoice list p95 under 200 ms") and let architecture choose.
Record Redis as a constraint only if it is genuinely imposed.

**Missing actor.**
Broken: "Invoices can be exported."
Repair: name who exports, and who may not.

**Missing exception path.**
Broken: "The system sends a confirmation email."
Repair: define behavior when the mail provider fails. Is the operation rolled back, queued,
or completed with a warning? This is a business decision, not a technical one — ask.

**Unbounded input.**
Broken: "The user uploads a document."
Repair: allowed types, maximum size, what happens above it, and where it is stored.

**Hidden tenancy assumption.**
Broken: "An admin can view all orders."
Repair: all orders in their tenant, or all orders in the system? These are different products
and different breach classes. Never assume.

**Implicit ordering or concurrency.**
Broken: "The balance is updated when a payment is recorded."
Repair: define behavior under two concurrent payments. Last-write-wins, locking, or atomic
increment are different business outcomes.

## Document-level checks

- Every actor in the permission matrix appears in at least one requirement.
- Every business rule identifier referenced by a requirement exists.
- Every requirement identifier is unique and never reused after deletion.
- Every open question has an owner and a recommended default.
- Contradictions are listed explicitly, not silently resolved.
- Non-functional requirements exist for performance, security and operability at minimum.
- The traceability matrix has no requirement without a test and no test without a requirement.

## Review questions that find what checklists miss

- What is the most expensive way to misread this document?
- Which requirement would a malicious authenticated user attack first?
- If the team implemented this literally and nothing else, what would the business be missing?
- Which requirement silently assumes the happy path always occurs?
- What did the source document mention once, in passing, that nobody has designed for?

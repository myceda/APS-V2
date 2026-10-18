# Track criteria

Departmental rules are separate from AcademicDataset and real track selection.
`unknown`, `specified`, and explicitly `not_required` are distinct. Never seed
remembered GPA thresholds or exemptions as confirmed rules.

Admin entry: `/admin/track-criteria`, scoped by CurriculumAdmin. Drafts can be
incomplete. Publication requires evidence and a published catalogue. Published
payloads are immutable; events contain snapshots. All writes in a curriculum
use one transaction advisory lock plus editVersion checks. Replacements are
explicit and must cover exactly the same cohort/term/track/date scope.

Student entry: a live panel in StudentWorkspace calls the authenticated
`/api/student/track-criteria` with the requested year/semester. The service reads
the owner's verified admission year and confirmed transcript, selects exact
published/in-date rules, and interprets grades using the pinned catalogue.
No prior-cohort fallback, no simulation grades, no approval writes. The return
type deliberately has only `approval: "not_verified"` in this release.

Admission year is nullable for existing data and must be recorded by an assigned
admin with a source. Do not derive it from studentCode or curriculum code.
The current cohort/term are not added to the transcript or modified by What-if.

Tests: unit covers rule validation/evaluation; integration covers grants,
concurrency and immutable history on aps_v2_test; signed fixture browser tests
cover admin and student flows. Fixtures are not actual Google acceptance.

Migration is additive. For rollback, retain new tables/columns and history when
reverting application code. Never overwrite newer work with an old backup.

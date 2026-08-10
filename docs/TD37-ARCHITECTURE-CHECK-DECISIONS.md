# TD37 Architecture Check Decisions

## Story 0 — semantic-analysis tool selection

The shared runner uses `ts-morph` 28.0.0. It loads each workspace TypeScript project from an explicit project list and passes the resulting `Project` instances to independently tested detector modules.

`ts-archunit` was evaluated as the alternative named by TD37, but no package with that name exists in the npm registry as of 2026-08-09. It therefore cannot be adopted as a reproducible workspace dependency. `ts-morph` is retained because it is available, type-aware, supports AST and symbol resolution through the repository's TypeScript projects, and expresses the three Story 0 spike rules without adding a repo-wide ESLint type-aware performance cost.

The first spike detectors are:

- transactional repository `save()` placement;
- concrete domain-error coverage by HTTP error mappers;
- unsafe Nest `useExisting` aliases that also register the target class.

Each detector has permanent positive/negative fixtures, reports a file and line with remediation, and exposes a scanned-target count. Empty scans are treated as invalid by the runner contract; this prevents an accidentally omitted project or glob from producing a false green result.

## Rollout

The initial CI invocation is report-only with `continue-on-error: true`. Promotion to blocking and then to a required check are separate changes after a burn-in period, matching TD37's three-phase rollout.

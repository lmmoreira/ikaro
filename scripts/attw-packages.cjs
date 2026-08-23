// Shared registry of the `packages/*` workspaces that ship real compiled
// runtime code (not just types) and are therefore in scope for
// `arethetypeswrong`'s publish-shape validation plus the packed-artifact
// runtime import smoke test (TD37-S14). Mirrors
// dependency-cruiser-projects.cjs's/knip-workspaces.cjs's pattern: an
// explicit registry here, independently cross-checked in
// attw-check-config.spec.cjs against root package.json's own `postinstall`
// script — the repo's existing single source of truth for this same list,
// also independently corroborated by every app's Dockerfile
// (apps/backend/Dockerfile, apps/bff/Dockerfile) building the identical
// subset before `pnpm deploy --prod`.
//
// Explicitly excluded, and why: `@ikaro/config` ships no `dist` at all (its
// eslint-base.js/prettier.config.js/tsconfig.*.json are consumed directly,
// never compiled) — structurally can't hit the #77 anti-pattern.
// `@ikaro/architecture-check` and `@ikaro/infra-scripts` both build a
// `dist/`, but neither has any real `workspace:*` consumer — both are
// CLI-only tools (`node dist/cli.js`, `node dist/env-contract.js`), never
// imported as a dependency by any app or package.
module.exports = [
  { name: '@ikaro/i18n', dir: 'packages/i18n' },
  { name: '@ikaro/observability', dir: 'packages/observability' },
  { name: '@ikaro/env-validation', dir: 'packages/env-validation' },
  { name: '@ikaro/types', dir: 'packages/types' },
  { name: '@ikaro/nestjs-http', dir: 'packages/nestjs-http' },
  { name: '@ikaro/validation', dir: 'packages/validation' },
  { name: '@ikaro/http-utils', dir: 'packages/http-utils' },
];

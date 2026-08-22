// Shared registry of pnpm workspaces knip.config.ts scans. Mirrors
// scripts/dependency-cruiser-projects.cjs's pattern for the same reason: AC
// requires explicit per-workspace entry/project settings, never knip's
// top-level monorepo defaults. `dir: '.'` is not a real pnpm workspace (it
// has no package.json `name`) — it covers root-level scripts/**/*.cjs so the
// root package.json's own devDependencies get checked against real usage
// too (TD37-S13 story-discovery addition, 2026-08-22).
//
// `!`-suffixed entries/project globs mark real PRODUCTION entry points —
// required for `knip --production --strict` (pnpm knip:production) to
// actually replicate the #79 anti-pattern (a package imported in production
// code but declared only under devDependencies). Verified empirically: an
// unsuffixed `project` glob is silently NEGATED (excluded) by knip's own
// production-mode file-graph traversal unless it also carries the `!`
// suffix — omitting it collapsed the entire reachable production graph down
// to almost nothing, producing ~80 false "unused dependency" findings for
// packages that are genuinely used (typeorm, zod, pg, ...).
//
// `src/main.ts!`/`src/tracing.ts!` ARE still declared explicitly below
// despite `knip --debug`'s "redundant entry pattern" hint: that hint is
// about DEFAULT mode, where the `dev` npm script (`ts-node ... src/main.ts`)
// already covers them. In `--production` mode only conventional production
// scripts count (`start`, which here points at built `dist/main.js` — never
// built in this checkout, so it can't resolve back to `src/main.ts`),
// verified empirically: without the explicit `!`-marked entries, production
// mode found zero real production entries for backend/bff and treated
// nearly the entire src/ tree as unreachable "unused files."
//
// Only apps/backend, apps/bff, and apps/web are real DEPLOYED production
// services (CLAUDE.md §1) — packages/* are consumed BY them, but have no
// dev/production split of their own, and apps/web's e2e/** is Playwright
// test-only code, never shipped. None of those get `!`-marked: verified
// empirically that marking apps/web's e2e/** entries as production pulled
// @playwright/test (a real devDependency) into the strict production
// dependency check as a false "unlisted" finding, and marking
// packages/config's eslint/prettier config files the same way did the
// identical thing to @typescript-eslint/*/eslint-plugin-prettier.
module.exports = [
  {
    dir: '.',
    entry: ['scripts/**/*.cjs'],
    project: ['scripts/**/*.cjs'],
  },
  {
    dir: 'apps/backend',
    plugins: { nest: true },
    entry: [
      'src/main.ts!',
      'src/tracing.ts!',
      'src/shared/database/data-source.ts!',
      'src/contexts/**/infrastructure/migrations/*.ts!',
      'src/shared/infrastructure/migrations/*.ts!',
    ],
    project: ['src/**/*.ts!'],
  },
  {
    dir: 'apps/bff',
    plugins: { nest: true },
    entry: ['src/main.ts!', 'src/tracing.ts!'],
    project: ['src/**/*.ts!'],
  },
  {
    dir: 'apps/web',
    plugins: { next: true, playwright: true, vitest: true },
    entry: ['e2e/**/*.spec.ts', 'e2e/helpers/**/*.ts'],
    project: ['**/*.{ts,tsx,js,mjs,cjs}!'],
  },
  {
    dir: 'packages/architecture-check',
    entry: ['src/cli.ts'],
    project: ['src/**/*.ts'],
  },
  {
    dir: 'packages/config',
    entry: ['eslint-base.js'],
    project: ['*.js'],
  },
  { dir: 'packages/env-validation', project: ['src/**/*.ts'] },
  { dir: 'packages/http-utils', project: ['src/**/*.ts'] },
  { dir: 'packages/i18n', project: ['src/**/*.ts'] },
  {
    dir: 'packages/infra-scripts',
    entry: ['src/env-contract.ts', 'src/pubsub-catalog.ts'],
    project: ['src/**/*.ts'],
  },
  { dir: 'packages/nestjs-http', plugins: { nest: true }, project: ['src/**/*.ts'] },
  { dir: 'packages/observability', project: ['src/**/*.ts'] },
  { dir: 'packages/types', entry: ['src/protocol/*.ts', 'src/media.ts'], project: ['src/**/*.ts'] },
  { dir: 'packages/validation', project: ['src/**/*.ts'] },
];

// Production-shaped runtime import smoke test (TD37-S14) — the half of
// this story `attw` alone can't cover: `attw` validates package metadata
// (main/types/exports resolution) but never actually executes `require()`
// against the packed artifact, so it can't by itself reproduce the #77
// Node native type-stripping / `pnpm deploy --prod` failure
// (`ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`) — that only surfaces when
// something real actually requires the package from inside a genuine
// `node_modules/@ikaro/<pkg>` directory.
//
// For each runtime-shipping package: build + pack (shared with
// attw-check.cjs via attw-pack.cjs), extract the tarball into an isolated
// scratch `node_modules/@ikaro/<pkg>` as a REAL extracted directory — never
// a workspace symlink back to `packages/<pkg>` the way local dev/pnpm
// resolves it — then `require()` it from a script living outside the
// package's own tree. This is the literal reproduction of both failure
// modes this check exists to catch: a stale/missing `dist/` (require()
// throws MODULE_NOT_FOUND) and a `main`/`types` field pointing back at
// `src/*.ts` (require() throws ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING
// once resolved through node_modules).
//
// Third-party and cross-`@ikaro/*` transitive dependencies (e.g.
// `@ikaro/nestjs-http` depends on `@ikaro/observability` + `@ikaro/types`)
// are resolved by symlinking every entry already present in the package's
// OWN `packages/<pkg>/node_modules` (pnpm has already correctly resolved
// that package's full dependency graph there — third-party packages via
// the `.pnpm` virtual store, sibling `@ikaro/*` packages via a direct
// symlink to `packages/<sibling>`) into the scratch consumer's
// `node_modules`. `shamefully-hoist=false` (.npmrc) means the repo ROOT's
// own `node_modules` does NOT contain these — only each workspace
// package's own `node_modules` does, verified empirically while writing
// this script. Only the package under test itself is swapped out for the
// real extracted tarball; every other entry stays a symlink, mirroring
// exactly what changes between local dev and `pnpm deploy --prod`.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const packages = require('./attw-packages.cjs');
const { packageDirName, run, buildAndPack } = require('./attw-pack.cjs');

function symlinkScopedDir(sourceDir, targetDir, excludeName) {
  fs.mkdirSync(targetDir, { recursive: true });
  for (const entry of fs.readdirSync(sourceDir)) {
    if (entry === excludeName) continue;
    fs.symlinkSync(path.join(sourceDir, entry), path.join(targetDir, entry));
  }
}

// Mirrors `pkg`'s own already-resolved `node_modules` into `targetNodeModules`,
// skipping `@ikaro/<dirName>` itself (that entry gets the real extracted
// tarball instead — see extractPackage below).
function mirrorOwnNodeModules(pkg, dirName, targetNodeModules) {
  fs.mkdirSync(targetNodeModules, { recursive: true });
  const sourceNodeModules = path.join(root, pkg.dir, 'node_modules');
  if (!fs.existsSync(sourceNodeModules)) return;

  for (const entry of fs.readdirSync(sourceNodeModules)) {
    if (entry === '.bin') continue;
    const sourcePath = path.join(sourceNodeModules, entry);
    if (entry === '@ikaro') {
      symlinkScopedDir(sourcePath, path.join(targetNodeModules, '@ikaro'), dirName);
      continue;
    }
    if (entry.startsWith('@')) {
      symlinkScopedDir(sourcePath, path.join(targetNodeModules, entry), null);
      continue;
    }
    fs.symlinkSync(sourcePath, path.join(targetNodeModules, entry));
  }
}

function extractPackage(tarball, targetNodeModules, dirName) {
  const extractedPackageDir = path.join(targetNodeModules, '@ikaro', dirName);
  fs.mkdirSync(extractedPackageDir, { recursive: true });
  return run('tar', ['-xzf', tarball, '-C', extractedPackageDir, '--strip-components=1']);
}

const scratchRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'attw-runtime-smoke-'));
let failures = 0;

for (const pkg of packages) {
  const dirName = packageDirName(pkg.name);
  const packDestDir = path.join(scratchRoot, 'tarballs', dirName);
  const tarball = buildAndPack(root, pkg, packDestDir);
  if (!tarball) {
    failures++;
    continue;
  }

  const consumerDir = path.join(scratchRoot, 'consumers', dirName);
  const targetNodeModules = path.join(consumerDir, 'node_modules');
  mirrorOwnNodeModules(pkg, dirName, targetNodeModules);

  process.stdout.write(`[attw-runtime-smoke] ${pkg.name}: extracting packed tarball\n`);
  const extractStatus = extractPackage(tarball, targetNodeModules, dirName);
  if (extractStatus !== 0) {
    failures++;
    continue;
  }

  const smokeScriptPath = path.join(consumerDir, 'smoke.cjs');
  fs.writeFileSync(
    smokeScriptPath,
    [
      `const mod = require(${JSON.stringify(pkg.name)});`,
      "if (!mod || typeof mod !== 'object' || Object.keys(mod).length === 0) {",
      `  console.error('[attw-runtime-smoke] ${pkg.name}: resolved module has no exports');`,
      '  process.exit(1);',
      '}',
      `console.log('[attw-runtime-smoke] ${pkg.name}: OK -', Object.keys(mod).length, 'export(s)');`,
      '',
    ].join('\n'),
  );

  process.stdout.write(`[attw-runtime-smoke] ${pkg.name}: require()-ing from extracted tarball\n`);
  const smokeStatus = run(process.execPath, [smokeScriptPath], { cwd: consumerDir });
  if (smokeStatus !== 0) failures++;
}

fs.rmSync(scratchRoot, { recursive: true, force: true });

if (failures > 0) {
  process.stderr.write(
    `[attw-runtime-smoke] ${failures} package(s) failed the runtime import smoke test.\n`,
  );
  process.exitCode = 1;
}

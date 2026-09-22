const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const packages = require('./attw-packages.cjs');

// Root package.json's own `build:libs` script is already the repo's single source of truth
// for "which packages/* ship real runtime code, not just types" (every app's Dockerfile
// independently builds the identical subset before `pnpm deploy --prod`; `postinstall` and
// `dev` both delegate to it rather than duplicating the chain). Parsing it here — instead of
// hand-maintaining a second copy of the same list — is what actually detects drift between
// it and attw-packages.cjs's registry.
function parseBuildLibsPackageNames(buildLibs) {
  return [...buildLibs.matchAll(/pnpm --filter (@ikaro\/[a-z0-9-]+) build/g)].map(
    (match) => match[1],
  );
}

test('registry matches root package.json build:libs exactly', () => {
  const rootPackageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const expected = parseBuildLibsPackageNames(rootPackageJson.scripts['build:libs']).sort();
  assert.ok(expected.length > 0, 'could not parse any package name out of build:libs');
  const configured = packages.map((pkg) => pkg.name).sort();
  assert.deepEqual(configured, expected);
  assert.equal(new Set(configured).size, configured.length);
});

test('every configured package resolves to a real workspace directory', () => {
  for (const pkg of packages) {
    const packageJsonPath = path.join(root, pkg.dir, 'package.json');
    assert.ok(fs.existsSync(packageJsonPath), `${pkg.name}: missing package.json at ${pkg.dir}`);

    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    assert.equal(
      packageJson.name,
      pkg.name,
      `${pkg.dir}: package.json name (${packageJson.name}) does not match registry (${pkg.name})`,
    );
    assert.ok(packageJson.scripts?.build, `${pkg.name}: package.json has no "build" script`);
    assert.ok(packageJson.main, `${pkg.name}: package.json has no "main" field`);
    assert.ok(packageJson.types, `${pkg.name}: package.json has no "types" field`);
    // Exact match, not `.includes('dist')` — a loose check would pass for
    // ["dist", "src"] just as easily, silently missing an accidental
    // source-directory publication (CodeRabbit finding, PR #405).
    const expectedFiles = pkg.name === '@ikaro/i18n' ? ['dist', 'locales'] : ['dist'];
    assert.deepEqual(
      [...(packageJson.files ?? [])].sort(),
      [...expectedFiles].sort(),
      `${pkg.name}: package.json "files" must match the publish allowlist exactly (${JSON.stringify(expectedFiles)})`,
    );
  }
});

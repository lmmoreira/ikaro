// Builds, packs, and runs `arethetypeswrong` (`attw`) against each
// runtime-shipping `packages/*` workspace (TD37-S14). Validates the built
// package's own type/package metadata (main/types/exports resolution,
// CJS/ESM consistency) against the real packed artifact — not the source
// tree — so a `package.json` field pointing at the wrong place, or a stale
// `dist/`, is caught the same way a real consumer's install would surface
// it. Does NOT by itself reproduce the #77 Node native type-stripping /
// `pnpm deploy --prod` runtime failure — see attw-runtime-smoke.cjs for
// that half of the check.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const packages = require('./attw-packages.cjs');
const { packageDirName, run, buildAndPack } = require('./attw-pack.cjs');

const attwBin = path.join(root, 'node_modules/.bin/attw');
if (!fs.existsSync(attwBin)) {
  process.stderr.write(
    '[attw-check] node_modules/.bin/attw not found — run `pnpm install` first.\n',
  );
  process.exit(1);
}

const scratchRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'attw-check-'));
let failures = 0;

for (const pkg of packages) {
  const packDestDir = path.join(scratchRoot, packageDirName(pkg.name));
  const tarball = buildAndPack(root, pkg, packDestDir);
  if (!tarball) {
    failures++;
    continue;
  }

  process.stdout.write(`[attw-check] ${pkg.name}: running attw --pack\n`);
  // --no-color: this script's output is also embedded verbatim in CI's
  // $GITHUB_STEP_SUMMARY inside a code fence — raw ANSI escapes would
  // render as garbage there, not colored text.
  const attwStatus = run(attwBin, ['--pack', tarball, '--no-color']);
  if (attwStatus !== 0) failures++;
}

fs.rmSync(scratchRoot, { recursive: true, force: true });

if (failures > 0) {
  process.stderr.write(`[attw-check] ${failures} package(s) failed attw validation.\n`);
  process.exitCode = 1;
}

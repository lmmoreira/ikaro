// Shared packing helper for attw-check.cjs and attw-runtime-smoke.cjs
// (TD37-S14). `pnpm pack` is used (not `npm pack`) because this is a pnpm
// workspace and `--pack-destination` gives a predictable output location —
// without it pnpm writes the tarball into the package's own directory,
// which both scripts would then need to clean up individually.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function packageDirName(packageName) {
  return packageName.replace('@ikaro/', '');
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', ...options });
  if (result.error) throw result.error;
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  return result.status ?? 1;
}

// Builds `pkg`, packs it into an isolated `destDir`, and returns the
// resulting tarball's absolute path (or null if either step failed — the
// caller is responsible for counting that as a failure).
function buildAndPack(root, pkg, destDir) {
  process.stdout.write(`[attw] ${pkg.name}: building\n`);
  const buildStatus = run('pnpm', ['--filter', pkg.name, 'build'], { cwd: root });
  if (buildStatus !== 0) return null;

  fs.mkdirSync(destDir, { recursive: true });
  process.stdout.write(`[attw] ${pkg.name}: packing\n`);
  const packStatus = run('pnpm', ['pack', '--pack-destination', destDir], {
    cwd: path.join(root, pkg.dir),
  });
  if (packStatus !== 0) return null;

  const tarball = fs.readdirSync(destDir).find((entry) => entry.endsWith('.tgz'));
  if (!tarball) {
    process.stderr.write(`[attw] ${pkg.name}: pnpm pack produced no .tgz in ${destDir}\n`);
    return null;
  }
  return path.join(destDir, tarball);
}

module.exports = { packageDirName, run, buildAndPack };

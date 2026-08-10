const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const projects = require('./dependency-cruiser-projects.cjs');
const policy = JSON.parse(
  fs.readFileSync(path.join(root, 'packages/architecture-check/architecture-policy.json'), 'utf8'),
);
const configPath = path.join(__dirname, 'dependency-cruiser.config.cjs');
const dependencyCruiserRoot = fs.realpathSync(path.join(root, 'node_modules/dependency-cruiser'));
const dependencyCruiseBin = path.join(dependencyCruiserRoot, 'bin/dependency-cruise.mjs');

function assertProjectRegistry() {
  const configuredPaths = projects.map((project) => project.tsConfig).sort();
  const policyPaths = [...(policy.projects ?? [])].sort();
  if (JSON.stringify(configuredPaths) !== JSON.stringify(policyPaths)) {
    throw new Error(
      'Dependency-cruiser project registry differs from architecture-policy.json#projects.',
    );
  }
}

function assertProjectFiles(project) {
  for (const relativePath of [
    project.source,
    project.tsConfig,
    `${project.tsConfig.replace(/\/tsconfig\.json$/, '')}/package.json`,
  ]) {
    if (!fs.existsSync(path.join(root, relativePath))) {
      throw new Error(`${project.name}: configured path does not exist: ${relativePath}`);
    }
  }
}

function runProject(project) {
  assertProjectFiles(project);
  const projectRoot = path.dirname(path.join(root, project.tsConfig));
  const source = path.relative(projectRoot, path.join(root, project.source)) || '.';
  const tsConfig = path.basename(project.tsConfig);
  process.stdout.write(`[dep-cruise] ${project.name}: scanning ${project.source}\n`);
  const result = spawnSync(
    process.execPath,
    [
      dependencyCruiseBin,
      '--config',
      configPath,
      '--ts-config',
      tsConfig,
      '--output-type',
      'err',
      '--progress',
      'none',
      '--exclude',
      '(^|/)(node_modules|dist|[.]next)(/|$)|(^|/)(vitest|playwright|eslint)[.]config[.][cm]?[jt]s$|(^|/)next-env[.]d[.]ts$',
      source,
    ],
    {
      cwd: projectRoot,
      encoding: 'utf8',
      env: { ...process.env, DEP_CRUISE_WORKSPACE: project.name },
    },
  );
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  return result.status ?? 1;
}

assertProjectRegistry();
const failures = projects.map(runProject).filter((status) => status !== 0);
if (failures.length > 0) {
  process.stderr.write(`[dep-cruise] ${failures.length} workspace scan(s) failed.\n`);
  process.exitCode = 1;
}

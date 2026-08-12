const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const dependencyCruiserRoot = fs.realpathSync(path.join(root, 'node_modules/dependency-cruiser'));
const dependencyCruiserRule = (name) =>
  require(path.join(dependencyCruiserRoot, 'configs/rules', `${name}.cjs`));
const noCircular = dependencyCruiserRule('no-circular');
const noNonPackageJson = dependencyCruiserRule('no-non-package-json');
const notToUnresolvable = dependencyCruiserRule('not-to-unresolvable');
const noDuplicateDependencyTypes = dependencyCruiserRule('no-duplicate-dependency-types');
const policy = JSON.parse(
  fs.readFileSync(path.join(root, 'packages/architecture-check/architecture-policy.json'), 'utf8'),
);
const contexts = fs
  .readdirSync(path.join(root, 'apps/backend/src/contexts'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);
const permittedEdges = policy.contextDependencyMatrix.permittedEdges;
const applicationAllowedPaths = policy.layerTaxonomy.application.sameContextAllowedApplicationPaths;
const testPath =
  '(^|/)(test|__tests__)/|[.](?:spec|test|integration[.]spec|component[.]spec)[.](?:[cm]?js|[cm]?ts|jsx|tsx)$';
const workspace = process.env.DEP_CRUISE_WORKSPACE ?? 'backend';
const backendSourcePrefix = workspace === 'backend' ? 'src/' : 'never/';
const productionSource = workspace === 'web' ? '^(app|features|shells|shared)/' : '^src/';

function escapeRegex(pathname) {
  return pathname.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function exactPath(pathname) {
  return `^${escapeRegex(pathname)}$`;
}

function policyPathPattern(pathname) {
  return `^${pathname
    .split('**')
    .map((segment) => segment.split('*').map(escapeRegex).join('[^/]*'))
    .join('.*')}$`;
}

function crossContextRules() {
  if (workspace !== 'backend') return [];
  return contexts.flatMap((sourceContext) =>
    contexts
      .filter((targetContext) => targetContext !== sourceContext)
      .flatMap((targetContext) => {
        const permittedSourcePaths = permittedEdges
          .filter((edge) => edge.owner === sourceContext && edge.target === targetContext)
          .map((edge) => exactPath(edge.source.replace('apps/backend/src/', 'src/')));
        const sourceRule = {
          name: `no-${sourceContext}-to-${targetContext}-context-import`,
          comment:
            'Cross-context imports are denied by default; add the exact source path to architecture-policy.json#contextDependencyMatrix.permittedEdges.',
          severity: 'error',
          from: {
            path: `^${backendSourcePrefix}contexts/${sourceContext}/`,
            pathNot: [testPath, '[.]module[.]ts$', ...permittedSourcePaths],
          },
          to: { path: `^${backendSourcePrefix}contexts/${targetContext}/` },
        };
        const targetRules = permittedEdges
          .filter((edge) => edge.owner === sourceContext && edge.target === targetContext)
          .map((edge) => ({
            name: `no-${edge.source.replace(/[^a-zA-Z0-9]+/g, '-').replace(/-ts$/, '')}-to-unapproved-${targetContext}-imports`,
            comment:
              'A permitted cross-context source may import only its exact target paths from architecture-policy.json#contextDependencyMatrix.permittedEdges.',
            severity: 'error',
            from: { path: exactPath(edge.source.replace('apps/backend/src/', 'src/')) },
            to: {
              path: `^${backendSourcePrefix}contexts/${targetContext}/`,
              pathNot: edge.targetPaths.map((targetPath) =>
                exactPath(targetPath.replace('apps/backend/src/', 'src/')),
              ),
            },
          }));
        return [sourceRule, ...targetRules];
      }),
  );
}

function applicationBoundaryRules() {
  if (workspace !== 'backend') return [];
  return contexts.map((context) => ({
    name: `no-${context}-application-internal-imports`,
    comment:
      'Use cases are self-contained: application imports may target domain code, ports, DTOs, services, and explicitly named shared abstractions only.',
    severity: 'error',
    from: {
      path: `^${backendSourcePrefix}contexts/${context}/application/`,
      pathNot: testPath,
    },
    to: {
      path: [
        `^${backendSourcePrefix}contexts/`,
        `^${backendSourcePrefix}shared/infrastructure/`,
        '(^|/)node_modules/@nestjs/(?!common/)',
        '(^|/)node_modules/(typeorm|axios|express)(/|$)',
      ],
      pathNot: [
        `^${backendSourcePrefix}contexts/${context}/domain/`,
        ...applicationAllowedPaths.map((allowedPath) =>
          policyPathPattern(`${backendSourcePrefix}contexts/${context}/${allowedPath}`),
        ),
      ],
    },
  }));
}

module.exports = {
  forbidden: [
    noCircular,
    noNonPackageJson,
    notToUnresolvable,
    noDuplicateDependencyTypes,
    {
      name: 'no-production-to-test',
      comment: 'Production modules must not depend on test-only modules.',
      severity: 'error',
      from: { pathNot: testPath },
      to: { path: testPath },
    },
    {
      name: 'no-production-to-dev-dependency',
      comment: 'Production modules must not depend on devDependencies.',
      severity: 'error',
      from: { path: productionSource, pathNot: testPath },
      to: {
        dependencyTypes: ['npm-dev', 'npm-optional'],
        dependencyTypesNot: ['type-only'],
      },
    },
    ...crossContextRules(),
    {
      name: 'no-domain-framework-or-infrastructure-imports',
      comment: 'Domain code must remain framework-free and infrastructure-free.',
      severity: 'error',
      from: { path: `^${backendSourcePrefix}contexts/[^/]+/domain/`, pathNot: testPath },
      to: {
        path: [
          `^${backendSourcePrefix}contexts/[^/]+/(application|infrastructure)/`,
          `^${backendSourcePrefix}shared/infrastructure/`,
          '(^|/)node_modules/@nestjs/',
          '(^|/)node_modules/(typeorm|axios|express)(/|$)',
        ],
      },
    },
    ...applicationBoundaryRules(),
    {
      name: 'no-bff-to-backend-context-import',
      comment:
        'The BFF communicates with the backend over HTTP, never by importing backend contexts.',
      severity: 'error',
      from: { path: workspace === 'bff' ? '^src/' : '^never/', pathNot: testPath },
      to: { path: '(^|/)backend/src/contexts/' },
    },
    {
      name: 'no-bff-shared-to-feature-import',
      comment: 'BFF shared infrastructure must remain feature-neutral.',
      severity: 'error',
      from: {
        path: workspace === 'bff' ? '^src/shared/' : '^never/',
        pathNot: testPath,
      },
      to: { path: '^src/features/' },
    },
    {
      name: 'backend-types-protocol-subpaths-only',
      comment:
        'Backend may import only the approved framework-neutral @ikaro/types protocol subpaths.',
      severity: 'error',
      from: { path: workspace === 'backend' ? '^src/' : '^never/', pathNot: testPath },
      to: {
        path: '^@ikaro/types',
        pathNot: [
          '^@ikaro/types/protocol/errors',
          '^@ikaro/types/protocol/actor',
          '^@ikaro/types/protocol/media',
        ],
      },
    },
  ],
  options: {
    doNotFollow: {
      path: '(^|/)(node_modules|dist)(/|$)',
      dependencyTypes: ['npm', 'npm-dev', 'npm-optional', 'npm-peer', 'npm-bundled', 'npm-no-pkg'],
    },
    tsPreCompilationDeps: 'specify',
  },
};

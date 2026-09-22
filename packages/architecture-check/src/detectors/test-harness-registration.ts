import { Node, Project, SourceFile, SyntaxKind } from 'ts-morph';
import type { Finding, ScanResult } from '../model';
import { sourceLine } from '../project';
import { hasTypeOrmDecorator, implementsTypeOrmInterface } from './typeorm-symbols';

const ENTITY_FILE =
  /(?:contexts\/[^/]+\/infrastructure\/entities\/|shared\/infrastructure\/[^/]+\/).*\.entity\.ts$/;
const MIGRATION_FILE =
  /(?:contexts\/[^/]+\/infrastructure\/migrations\/|shared\/infrastructure\/migrations\/).*\.ts$/;

interface TestDataHarnessRegistrationBase {
  file: string;
  requiresMigrations?: boolean;
}

// A discriminated union, not an optional `entities?: string[]` on one flat interface — makes a
// `completeness: 'partial'` entry with no `entities` list structurally unrepresentable. Without
// this, a policy entry that forgets `entities` silently falls back to an empty expected set and
// every entity actually in the harness file is reported "unexpected", blaming the wrong side.
export type TestDataHarnessRegistration = TestDataHarnessRegistrationBase &
  // "complete" — must carry every resolved production entity/migration.
  (
    | { completeness: 'complete'; entities?: never }
    // "partial" — an intentional, explicitly-declared subset; the file's actual array is
    // compared against this list rather than against the full production set.
    | { completeness: 'partial'; entities: string[] }
  );

function resolvedClassNames(
  project: Project,
  fileRegex: RegExp,
  implementsName?: string,
): Set<string> {
  const names = new Set<string>();
  for (const sourceFile of project.getSourceFiles()) {
    const filePath = sourceFile.getFilePath();
    if (!fileRegex.test(filePath) || sourceFile.getBaseName().endsWith('.spec.ts')) continue;
    for (const declaration of sourceFile.getDescendantsOfKind(SyntaxKind.ClassDeclaration)) {
      const name = declaration.getName();
      if (!name) continue;
      if (implementsName) {
        if (!implementsTypeOrmInterface(declaration, implementsName)) continue;
      } else if (!hasTypeOrmDecorator(declaration, 'Entity')) {
        continue;
      }
      names.add(name);
    }
  }
  return names;
}

// Finds the single `new DataSource({...})` or `TypeOrmModule.forRoot({...})` options object —
// the only two shapes this codebase uses to declare a test-harness entity/migration list. Scoped
// to this specific call's options object, not a file-wide property-name search, so an unrelated
// same-named `entities:`/`migrations:` property elsewhere in the file can never be silently
// picked up instead.
function findHarnessOptionsObject(sourceFile: SourceFile): Node | undefined {
  for (const newExpression of sourceFile.getDescendantsOfKind(SyntaxKind.NewExpression)) {
    const callee = newExpression.getExpression();
    if (!Node.isIdentifier(callee) || callee.getText() !== 'DataSource') continue;
    const [arg] = newExpression.getArguments();
    if (arg && Node.isObjectLiteralExpression(arg)) return arg;
  }
  for (const call of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const callee = call.getExpression();
    if (
      !Node.isPropertyAccessExpression(callee) ||
      callee.getName() !== 'forRoot' ||
      !Node.isIdentifier(callee.getExpression()) ||
      callee.getExpression().getText() !== 'TypeOrmModule'
    ) {
      continue;
    }
    const [arg] = call.getArguments();
    if (arg && Node.isObjectLiteralExpression(arg)) return arg;
  }
  return undefined;
}

// Reads the array literal assigned to `propertyName:` inside the harness's own options object. A
// `...spread` element (e.g. notification-integration-app's `...extraEntities`, resolved only at
// runtime by the caller) is skipped, not treated as drift.
function readDeclaredArray(
  sourceFile: SourceFile,
  propertyName: string,
): { names: Set<string>; node: Node | undefined } {
  const optionsObject = findHarnessOptionsObject(sourceFile);
  if (!optionsObject || !Node.isObjectLiteralExpression(optionsObject)) {
    return { names: new Set(), node: undefined };
  }
  const property = optionsObject.getProperty(propertyName);
  if (!property || !Node.isPropertyAssignment(property))
    return { names: new Set(), node: undefined };
  const initializer = property.getInitializer();
  if (!initializer || !Node.isArrayLiteralExpression(initializer)) {
    return { names: new Set(), node: undefined };
  }
  const names = new Set(
    initializer
      .getElements()
      .filter(Node.isIdentifier)
      .map((element) => element.getText()),
  );
  return { names, node: initializer };
}

function diffFinding(
  rule: string,
  file: string,
  line: number,
  label: string,
  declaredWhere: string,
  actual: Set<string>,
  expected: Set<string>,
): Finding | undefined {
  const missing = [...expected].filter((name) => !actual.has(name)).sort();
  const extra = [...actual].filter((name) => !expected.has(name)).sort();
  if (missing.length === 0 && extra.length === 0) return undefined;

  const parts: string[] = [];
  if (missing.length > 0) parts.push(`missing ${missing.join(', ')}`);
  if (extra.length > 0) parts.push(`unexpected ${extra.join(', ')}`);
  return {
    rule,
    file,
    line,
    message: `${label} array is out of sync with ${declaredWhere}: ${parts.join('; ')}.`,
  };
}

export function checkTestDataHarnessRegistrations(
  project: Project,
  registrations: TestDataHarnessRegistration[],
): ScanResult {
  const findings: Finding[] = [];
  let scannedTargets = 0;

  const allEntities = resolvedClassNames(project, ENTITY_FILE);
  const allMigrations = resolvedClassNames(project, MIGRATION_FILE, 'MigrationInterface');

  for (const registration of registrations) {
    const sourceFile = project
      .getSourceFiles()
      .find((file) => file.getFilePath().endsWith(registration.file));
    if (!sourceFile) {
      scannedTargets++;
      findings.push({
        rule: 'test-harness-registration',
        file: registration.file,
        line: 1,
        message: `architecture-policy.json registers ${registration.file} but no such file was resolved in the project.`,
      });
      continue;
    }

    scannedTargets++;
    const expectedEntities =
      registration.completeness === 'complete' ? allEntities : new Set(registration.entities);
    const { names: actualEntities, node: entitiesNode } = readDeclaredArray(sourceFile, 'entities');
    const entityFinding = diffFinding(
      'test-harness-registration',
      sourceFile.getFilePath(),
      entitiesNode ? sourceLine(sourceFile, entitiesNode.getStart()) : 1,
      `${registration.file}'s entities`,
      registration.completeness === 'complete'
        ? 'the full set of production TypeORM entities'
        : "architecture-policy.json's testDataHarnessRegistrations entry for this file",
      actualEntities,
      expectedEntities,
    );
    if (entityFinding) findings.push(entityFinding);

    if (!registration.requiresMigrations) continue;

    scannedTargets++;
    const { names: actualMigrations, node: migrationsNode } = readDeclaredArray(
      sourceFile,
      'migrations',
    );
    const migrationFinding = diffFinding(
      'test-harness-registration',
      sourceFile.getFilePath(),
      migrationsNode ? sourceLine(sourceFile, migrationsNode.getStart()) : 1,
      `${registration.file}'s migrations`,
      'the full set of production migrations',
      actualMigrations,
      allMigrations,
    );
    if (migrationFinding) findings.push(migrationFinding);
  }

  return { rule: 'test-harness-registration', scannedTargets, findings };
}

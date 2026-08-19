import { ClassDeclaration, Node, Project, PropertyDeclaration, SyntaxKind } from 'ts-morph';
import type { Finding, ScanResult } from '../model';
import { sourceLine } from '../project';

const ENTITY_FILE =
  /(?:contexts\/[^/]+\/infrastructure\/entities\/|shared\/infrastructure\/[^/]+\/).*\.entity\.ts$/;
const BUILDER_FILE = /test\/builders\/[^/]+\/.*\.builder\.ts$/;

// `tenantId` is excluded even when it participates in a composite primary key (e.g.
// LoyaltyBalanceEntity's (tenant_id, customer_id)): every builder in this codebase defaults
// tenantId to the fixed test-tenant literal, never uuidv7() — that's a deliberate readability
// convention (a stable, greppable tenant id across every test), not an omission.
const EXEMPT_FIELD_NAMES = new Set(['tenantId']);

function isUuidTypedPrimaryColumn(property: PropertyDeclaration): boolean {
  const decorator = property
    .getDecorators()
    .find((d) => d.getName() === 'PrimaryColumn' || d.getName() === 'PrimaryGeneratedColumn');
  if (!decorator) return false;

  const [firstArg] = decorator.getArguments();
  if (decorator.getName() === 'PrimaryGeneratedColumn') {
    // No-arg (or an explicit 'uuid' strategy) generates a UUID column; any other explicit
    // strategy ('increment', 'rowid', 'identity', ...) is not a UUID-shaped primary key.
    if (!firstArg) return true;
    return Node.isStringLiteral(firstArg) && firstArg.getLiteralText() === 'uuid';
  }

  // PrimaryColumn({ type: 'uuid', ... }) — this codebase always states `type` explicitly, so a
  // missing/non-string `type` is treated as "not a UUID column" rather than guessed at.
  if (!firstArg || !Node.isObjectLiteralExpression(firstArg)) return false;
  const typeProperty = firstArg.getProperty('type');
  if (!typeProperty || !Node.isPropertyAssignment(typeProperty)) return false;
  const initializer = typeProperty.getInitializer();
  return Boolean(initializer && Node.isStringLiteral(initializer) && initializer.getLiteralText() === 'uuid');
}

function isUuidV7Call(node: Node | undefined): boolean {
  return Boolean(node && Node.isCallExpression(node) && node.getExpression().getText() === 'uuidv7');
}

// The story text explicitly warns not to assume the default lives in a field initializer — so
// this also checks a `this.<field> = uuidv7()` assignment inside the builder's constructor, even
// though every current *EntityBuilder happens to use a field initializer.
function builderDefaultsToUuidV7(builderClass: ClassDeclaration, fieldName: string): boolean {
  const property = builderClass.getProperty(fieldName);
  if (isUuidV7Call(property?.getInitializer())) return true;

  const constructor = builderClass.getConstructors()[0];
  if (!constructor) return false;
  return constructor.getDescendantsOfKind(SyntaxKind.BinaryExpression).some((expression) => {
    if (expression.getOperatorToken().getText() !== '=') return false;
    const left = expression.getLeft();
    return (
      Node.isPropertyAccessExpression(left) &&
      Node.isThisExpression(left.getExpression()) &&
      left.getName() === fieldName &&
      isUuidV7Call(expression.getRight())
    );
  });
}

function findBuilderClass(project: Project, className: string): ClassDeclaration | undefined {
  for (const sourceFile of project.getSourceFiles()) {
    if (!BUILDER_FILE.test(sourceFile.getFilePath())) continue;
    const declaration = sourceFile
      .getDescendantsOfKind(SyntaxKind.ClassDeclaration)
      .find((c) => c.getName() === className);
    if (declaration) return declaration;
  }
  return undefined;
}

export function checkEntityBuilderPrimaryKeyDefaults(project: Project): ScanResult {
  const findings: Finding[] = [];
  let scannedTargets = 0;

  for (const sourceFile of project.getSourceFiles()) {
    const filePath = sourceFile.getFilePath();
    if (!ENTITY_FILE.test(filePath) || sourceFile.getBaseName().endsWith('.spec.ts')) continue;

    for (const declaration of sourceFile.getDescendantsOfKind(SyntaxKind.ClassDeclaration)) {
      if (!declaration.getDecorators().some((d) => d.getName() === 'Entity')) continue;
      const entityName = declaration.getName();
      if (!entityName) continue;

      // A missing builder is test-builder-coverage's finding, not this check's — avoid
      // reporting the same gap twice through two different rules.
      const builderClass = findBuilderClass(project, `${entityName}Builder`);
      if (!builderClass) continue;

      for (const property of declaration.getProperties()) {
        const fieldName = property.getName();
        if (EXEMPT_FIELD_NAMES.has(fieldName)) continue;
        if (!isUuidTypedPrimaryColumn(property)) continue;

        scannedTargets++;
        if (builderDefaultsToUuidV7(builderClass, fieldName)) continue;
        findings.push({
          rule: 'entity-builder-pk-uuidv7-default',
          file: filePath,
          line: sourceLine(sourceFile, property.getStart()),
          message: `${entityName}.${fieldName} is a uuid primary key but ${entityName}Builder's "${fieldName}" field does not default to uuidv7().`,
        });
      }
    }
  }

  return { rule: 'entity-builder-pk-uuidv7-default', scannedTargets, findings };
}

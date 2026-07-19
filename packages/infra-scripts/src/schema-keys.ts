import * as fs from 'node:fs';
import * as ts from 'typescript';

/**
 * Extracts the top-level property names of a `z.object({ ... })` call
 * assigned to a variable named `schema`, via the TypeScript AST — not a
 * runtime import, so this never executes app code and never crosses the
 * apps/* <-> packages/* dependency boundary.
 */
export function extractSchemaKeysFromSource(sourceText: string, fileName = 'schema.ts'): string[] {
  const sourceFile = ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.Latest, true);

  let objectLiteral: ts.ObjectLiteralExpression | undefined;

  const visit = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === 'schema' &&
      node.initializer
    ) {
      objectLiteral = findObjectLiteralArgument(node.initializer);
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);

  if (!objectLiteral) {
    throw new Error(`No "schema = z.object({ ... })" declaration found in ${fileName}`);
  }

  return objectLiteral.properties
    .filter(
      (prop): prop is ts.PropertyAssignment =>
        ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name),
    )
    .map((prop) => (prop.name as ts.Identifier).text);
}

export function extractSchemaKeys(filePath: string): string[] {
  const content = fs.readFileSync(filePath, 'utf8');
  return extractSchemaKeysFromSource(content, filePath);
}

function findObjectLiteralArgument(node: ts.Expression): ts.ObjectLiteralExpression | undefined {
  if (ts.isCallExpression(node)) {
    return node.arguments.find(ts.isObjectLiteralExpression);
  }
  return undefined;
}

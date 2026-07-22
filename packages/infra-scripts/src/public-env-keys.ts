import * as fs from 'node:fs';
import * as ts from 'typescript';

/**
 * Extracts the string-literal elements of a `PUBLIC_ENV_KEYS = [...] as const`
 * array declaration, via the TypeScript AST — not a runtime import, same
 * approach as schema-keys.ts's Zod-object extractor, just for an
 * array-literal shape instead of a `z.object()` call (apps/web has no Zod
 * env schema; `public-env.ts`'s `PUBLIC_ENV_KEYS` const is its source of
 * truth instead).
 */
export function extractPublicEnvKeysFromSource(
  sourceText: string,
  fileName = 'public-env.ts',
): string[] {
  const sourceFile = ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.Latest, true);

  let arrayLiteral: ts.ArrayLiteralExpression | undefined;

  const visit = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === 'PUBLIC_ENV_KEYS' &&
      node.initializer
    ) {
      arrayLiteral = findArrayLiteralArgument(node.initializer);
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);

  if (!arrayLiteral) {
    throw new Error(`No "PUBLIC_ENV_KEYS = [...]" array declaration found in ${fileName}`);
  }

  return arrayLiteral.elements.map((element) => {
    if (!ts.isStringLiteral(element)) {
      throw new Error(
        `${fileName}: "PUBLIC_ENV_KEYS" contains a non-string-literal element ` +
          `(${element.getText(sourceFile)}) — every entry must be a plain string literal`,
      );
    }
    return element.text;
  });
}

export function extractPublicEnvKeys(filePath: string): string[] {
  const content = fs.readFileSync(filePath, 'utf8');
  return extractPublicEnvKeysFromSource(content, filePath);
}

/** Unwraps an `as const` assertion (or parens) to find the underlying array literal. */
function findArrayLiteralArgument(node: ts.Expression): ts.ArrayLiteralExpression | undefined {
  if (ts.isArrayLiteralExpression(node)) {
    return node;
  }
  if (ts.isAsExpression(node) || ts.isParenthesizedExpression(node)) {
    return findArrayLiteralArgument(node.expression);
  }
  return undefined;
}

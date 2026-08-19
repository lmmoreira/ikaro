import { MethodDeclaration, Node, Project, SyntaxKind } from 'ts-morph';
import type { Finding, ScanResult } from '../model';
import { sourceLine } from '../project';

function throwsBareError(method: MethodDeclaration): boolean {
  return method.getDescendantsOfKind(SyntaxKind.ThrowStatement).some((statement) => {
    const expression = statement.getExpression();
    if (!expression || !Node.isNewExpression(expression)) return false;
    return expression.getExpression().getSymbol()?.getName() === 'Error';
  });
}

// Scans by directory (`**/value-objects/**`) and by member shape (a static `create` method),
// not by filename suffix — several VOs (e.g. money.ts, address.ts) don't use the `.vo.ts`
// suffix, and at least one VO-shaped class (TenantSettings) doesn't extend the shared
// ValueObject<T> base at all, so neither a filename nor a base-class check alone is complete.
export function checkValueObjectCreateNeverThrowsBareError(project: Project): ScanResult {
  const findings: Finding[] = [];
  let scannedTargets = 0;

  for (const sourceFile of project.getSourceFiles()) {
    if (
      !/\/value-objects\//.test(sourceFile.getFilePath()) ||
      sourceFile.getBaseName().endsWith('.spec.ts')
    ) {
      continue;
    }
    for (const declaration of sourceFile.getClasses()) {
      const createMethod = declaration
        .getMethods()
        .find((method) => method.isStatic() && method.getName() === 'create');
      if (!createMethod) continue;

      scannedTargets++;
      if (!throwsBareError(createMethod)) continue;

      const name = declaration.getName() ?? '<anonymous>';
      findings.push({
        rule: 'vo-create-no-bare-error',
        file: sourceFile.getFilePath(),
        line: sourceLine(sourceFile, createMethod.getStart()),
        message: `${name}.create() throws a bare Error. Every mapXxxError ends with "if (err instanceof Error) throw err", so this becomes an unhandled 500 instead of a shaped 400 — throw a typed error class implementing DomainErrorShape instead.`,
      });
    }
  }

  return { rule: 'vo-create-no-bare-error', scannedTargets, findings };
}

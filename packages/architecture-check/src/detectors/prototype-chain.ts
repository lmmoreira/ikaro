import { ConstructorDeclaration, Node, Project, SyntaxKind } from 'ts-morph';
import type { Finding, ScanResult } from '../model';
import { sourceLine } from '../project';

function callsSetPrototypeOf(constructor: ConstructorDeclaration): boolean {
  return constructor.getDescendantsOfKind(SyntaxKind.CallExpression).some((call) => {
    const expression = call.getExpression();
    if (!Node.isPropertyAccessExpression(expression)) return false;
    if (
      expression.getExpression().getText() !== 'Object' ||
      expression.getName() !== 'setPrototypeOf'
    ) {
      return false;
    }
    const args = call.getArguments();
    return args[0]?.getText() === 'this' && args[1]?.getText() === 'new.target.prototype';
  });
}

// Scoped to *direct* subclasses of Error only: a class extending an intermediate error class
// (e.g. ServiceNotFoundError extends BookingDomainError) inherits a correctly-fixed prototype
// chain from its parent's constructor without needing to repeat the call itself, because
// `new.target` is resolved dynamically at the `new ServiceNotFoundError(...)` call site
// regardless of which ancestor constructor actually calls Object.setPrototypeOf.
export function checkPrototypeChainSafety(project: Project): ScanResult {
  const findings: Finding[] = [];
  let scannedTargets = 0;

  for (const sourceFile of project.getSourceFiles()) {
    if (
      sourceFile.isDeclarationFile() ||
      /\.spec\.ts$|\.integration\.spec\.ts$/.test(sourceFile.getFilePath())
    ) {
      continue;
    }
    for (const declaration of sourceFile.getClasses()) {
      const extendsClause = declaration.getExtends();
      if (!extendsClause) continue;
      if (extendsClause.getExpression().getSymbol()?.getName() !== 'Error') continue;

      const constructor = declaration.getConstructors()[0];
      if (!constructor) continue;

      scannedTargets++;
      if (callsSetPrototypeOf(constructor)) continue;

      const name = declaration.getName() ?? '<anonymous>';
      findings.push({
        rule: 'error-prototype-chain',
        file: sourceFile.getFilePath(),
        line: sourceLine(sourceFile, constructor.getStart()),
        message: `${name} extends Error and declares its own constructor but never calls Object.setPrototypeOf(this, new.target.prototype) — instanceof checks against ${name} will silently fail once compiled.`,
      });
    }
  }

  return { rule: 'error-prototype-chain', scannedTargets, findings };
}

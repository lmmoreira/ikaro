import { CallExpression, Node, Project, SyntaxKind } from 'ts-morph';
import type { Finding, ScanResult } from '../model';
import { sourceLine } from '../project';
import { isDirectlyInsideTransactionCallback } from './transaction-boundary';

export interface ExternalSideEffectPort {
  portFile: string;
  interfaceName: string;
  methodName: string;
  adapterPaths: string[];
}

function hasRegisteredAdapter(project: Project, entry: ExternalSideEffectPort): boolean {
  return entry.adapterPaths.every((adapterPath) => {
    const sourceFile = project
      .getSourceFiles()
      .find((candidate) => candidate.getFilePath().endsWith(adapterPath));
    return Boolean(
      sourceFile
        ?.getClasses()
        .some(
          (adapter) =>
            adapter
              .getImplements()
              .some(
                (implemented) => implemented.getExpression().getText() === entry.interfaceName,
              ) && adapter.getInstanceMethod(entry.methodName),
        ),
    );
  });
}

function isRegisteredExternalSideEffect(
  call: CallExpression,
  registry: ExternalSideEffectPort[],
): boolean {
  const expression = call.getExpression();
  if (!Node.isPropertyAccessExpression(expression)) return false;

  const methodName = expression.getName();
  const methodSymbol = expression.getExpression().getType().getProperty(methodName);
  if (!methodSymbol) return false;

  return methodSymbol.getDeclarations().some((declaration) => {
    if (!Node.isMethodSignature(declaration)) return false;
    const parent = declaration.getParent();
    if (!Node.isInterfaceDeclaration(parent)) return false;
    return registry.some(
      (entry) =>
        entry.methodName === methodName &&
        entry.interfaceName === parent.getName() &&
        declaration.getSourceFile().getFilePath().endsWith(entry.portFile),
    );
  });
}

export function checkTransactionalIo(
  project: Project,
  registry: ExternalSideEffectPort[],
): ScanResult {
  const findings: Finding[] = [];
  let scannedTargets = 0;

  for (const entry of registry) {
    if (hasRegisteredAdapter(project, entry)) continue;
    findings.push({
      rule: 'transactional-io',
      file: entry.portFile,
      line: 1,
      message: `Registered external-side-effect method ${entry.interfaceName}.${entry.methodName} must name concrete adapter implementations.`,
    });
  }

  for (const sourceFile of project.getSourceFiles()) {
    if (
      sourceFile.isDeclarationFile() ||
      /\.spec\.ts$|\.integration\.spec\.ts$/.test(sourceFile.getFilePath())
    ) {
      continue;
    }
    for (const call of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      if (!isRegisteredExternalSideEffect(call, registry)) continue;
      scannedTargets++;
      if (!isDirectlyInsideTransactionCallback(call)) continue;
      findings.push({
        rule: 'transactional-io',
        file: sourceFile.getFilePath(),
        line: sourceLine(sourceFile, call.getStart()),
        message:
          'Registered external-side-effect port method must execute after ITransactionManager.run() returns or via scheduleAfterCommit().',
      });
    }
  }
  return { rule: 'transactional-io', scannedTargets, findings };
}

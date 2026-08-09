import { CallExpression, Node, Project, SyntaxKind } from 'ts-morph';
import type { Finding, ScanResult } from '../model';
import { sourceLine } from '../project';

function isTransactionRun(call: CallExpression): boolean {
  const expression = call.getExpression();
  if (!Node.isPropertyAccessExpression(expression)) return false;
  if (expression.getName() !== 'run') return false;
  const typeText = expression.getExpression().getType().getText(call);
  return typeText.includes('ITransactionManager') || typeText.includes('TransactionManager');
}

function isInsideTransactionSave(call: CallExpression): boolean {
  let current: Node | undefined = call.getParent();
  while (current) {
    if (Node.isCallExpression(current) && isTransactionRun(current)) {
      const callback = current.getArguments()[0];
      if (!callback) return false;
      let descendant: Node | undefined = call;
      while (descendant && descendant !== current) {
        if (descendant === callback) return true;
        descendant = descendant.getParent();
      }
    }
    current = current.getParent();
  }
  return false;
}

export function checkTransactionalSaves(project: Project): ScanResult {
  const findings: Finding[] = [];
  let scannedTargets = 0;
  for (const sourceFile of project.getSourceFiles()) {
    if (
      sourceFile.isDeclarationFile() ||
      /\.spec\.ts$|\.integration\.spec\.ts$/.test(sourceFile.getFilePath()) ||
      !/contexts\/[^/]+\/application\/.*\.use-case\.ts$/.test(sourceFile.getFilePath())
    )
      continue;
    for (const call of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      const expression = call.getExpression();
      if (!Node.isPropertyAccessExpression(expression) || expression.getName() !== 'save') continue;
      scannedTargets++;
      if (!isInsideTransactionSave(call)) {
        findings.push({
          rule: 'transactional-save',
          file: sourceFile.getFilePath(),
          line: sourceLine(sourceFile, call.getStart()),
          message: 'Repository save() must execute inside an ITransactionManager.run() callback.',
        });
      }
    }
  }
  return { rule: 'transactional-save', scannedTargets, findings };
}

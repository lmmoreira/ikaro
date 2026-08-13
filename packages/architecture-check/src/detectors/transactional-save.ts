import { CallExpression, Node, Project, SyntaxKind } from 'ts-morph';
import type { Finding, ScanResult } from '../model';
import { sourceLine } from '../project';
import { isDirectlyInsideTransactionCallback } from './transaction-boundary';

function isRepositorySave(call: CallExpression): boolean {
  const expression = call.getExpression();
  if (!Node.isPropertyAccessExpression(expression) || expression.getName() !== 'save') return false;
  const receiverType = expression.getExpression().getType();
  if (!receiverType.getProperty('save')) return false;
  return /\bI?[A-Za-z]*Repository\b/.test(receiverType.getText(call));
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
      if (!isRepositorySave(call)) continue;
      scannedTargets++;
      if (!isDirectlyInsideTransactionCallback(call)) {
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

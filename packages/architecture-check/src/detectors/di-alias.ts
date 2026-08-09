import { Node, Project, SyntaxKind } from 'ts-morph';
import type { Finding, ScanResult } from '../model';
import { sourceLine } from '../project';

export function checkUnsafeUseExisting(project: Project): ScanResult {
  const findings: Finding[] = [];
  let scannedTargets = 0;
  for (const sourceFile of project.getSourceFiles()) {
    if (!sourceFile.getFilePath().endsWith('.module.ts')) continue;
    for (const array of sourceFile.getDescendantsOfKind(SyntaxKind.ArrayLiteralExpression)) {
      const providers = array.getElements();
      const bareClasses = new Set(
        providers.filter(Node.isIdentifier).map((provider) => provider.getText()),
      );
      for (const provider of providers) {
        if (!Node.isObjectLiteralExpression(provider)) continue;
        const useExisting = provider.getProperty('useExisting');
        if (!useExisting || !Node.isPropertyAssignment(useExisting)) continue;
        const target = useExisting.getInitializer()?.getText();
        if (!target) continue;
        scannedTargets++;
        if (bareClasses.has(target)) {
          findings.push({
            rule: 'unsafe-use-existing',
            file: sourceFile.getFilePath(),
            line: sourceLine(sourceFile, provider.getStart()),
            message: `${target} is registered as a class and also targeted by useExisting. Anchor the class provider and alias tokens to it instead.`,
          });
        }
      }
    }
  }
  return { rule: 'unsafe-use-existing', scannedTargets, findings };
}

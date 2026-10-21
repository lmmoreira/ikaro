import { Project } from 'ts-morph';
import type { Finding, ScanResult } from '../model';
import { sourceLine } from '../project';

const RULE = 'lock-catalog-coverage';

// A port method that takes a lock: the advisory-lock port's lock*() methods and any repository
// method that ends in ForUpdate (a SELECT ... FOR UPDATE row lock).
const LOCKING_METHOD = /^lock([A-Z]|$)|ForUpdate$/;

// The whole method name, not a longer one that contains it (lockResource vs lockResources).
function catalogNames(catalogText: string, name: string): boolean {
  return new RegExp(`(?<![A-Za-z0-9_])${name}(?![A-Za-z0-9_])`).test(catalogText);
}

// A new lock that is not in docs/LOCK_CATALOG.md has no place in the lock order, no business
// case and no test that proves it, so the next change can deadlock against it unseen. Every
// locking method on a port must be named in the catalog (docs/LOCK_CATALOG.md § 7).
export function checkLockCatalogCoverage(project: Project, catalogText: string): ScanResult {
  const findings: Finding[] = [];
  let scannedTargets = 0;
  for (const sourceFile of project.getSourceFiles()) {
    const path = sourceFile.getFilePath();
    if (sourceFile.isDeclarationFile() || !/\/application\/ports\/|\/shared\/ports\//.test(path))
      continue;
    for (const declaration of sourceFile.getInterfaces()) {
      for (const method of declaration.getMethods()) {
        const name = method.getName();
        if (!LOCKING_METHOD.test(name)) continue;
        scannedTargets++;
        if (catalogNames(catalogText, name)) continue;
        findings.push({
          rule: RULE,
          file: path,
          line: sourceLine(sourceFile, method.getStart()),
          message: `${declaration.getName()}.${name}() takes a lock but docs/LOCK_CATALOG.md never names it. Add its entry (§ 3), its place in the order (§ 2, § 4) and the test that proves it (§ 3.1).`,
        });
      }
    }
  }
  return { rule: RULE, scannedTargets, findings };
}

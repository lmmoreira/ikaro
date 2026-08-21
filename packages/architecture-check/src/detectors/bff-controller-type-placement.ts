import { InterfaceDeclaration, Project, TypeAliasDeclaration, VariableDeclaration } from 'ts-morph';
import type { Finding, ScanResult } from '../model';
import { sourceLine } from '../project';

const BFF_CONTROLLER_FILE = /\/features\/.*\.controller\.ts$/;

export interface BffInlineTypeException {
  path: string;
  name: string;
}

function isExempt(filePath: string, name: string, exceptions: BffInlineTypeException[]): boolean {
  return exceptions.some(
    (exception) => exception.name === name && filePath.endsWith(exception.path),
  );
}

// Response shapes belong in `<module>.types.ts` (docs/ANTI_PATTERNS.md row on inline BFF
// response interfaces) and request Zod schemas / their inferred Body|Query types belong in a
// sibling `<module>.schemas.ts` (mirrors booking/bookings.schemas.ts's existing split, adopted
// codebase-wide by TD37-S10). Neither may be declared directly in a `*.controller.ts` file —
// only re-exported from one (`export * from './xxx.schemas'`), which this check doesn't see
// since it only looks at declarations, not re-export statements.
export function checkBffTypesLiveInModuleFiles(
  project: Project,
  exceptions: BffInlineTypeException[] = [],
): ScanResult {
  const findings: Finding[] = [];
  let scannedTargets = 0;

  for (const sourceFile of project.getSourceFiles()) {
    if (
      !BFF_CONTROLLER_FILE.test(sourceFile.getFilePath()) ||
      sourceFile.getBaseName().endsWith('.spec.ts')
    ) {
      continue;
    }
    // Counts controller files examined, not declarations found — the healthy end state is
    // zero inline declarations, and scannedTargets must stay > 0 in that state so the
    // package-wide zero-target sanity check (cli.ts) doesn't mistake "nothing to flag" for
    // "the glob silently matched nothing."
    scannedTargets++;

    // A Zod schema const (`const XSchema = z.object(...)`) is its own declaration kind —
    // not an interface/type alias — so it needs separate collection. Matched by name suffix
    // (top-level `const` ending in "Schema"), the same literal convention this codebase
    // already uses without exception across every controller (confirmed via full-BFF grep,
    // TD37-S10) — not by resolving the Zod call chain, which the naming convention already
    // makes unnecessary. A schema with no paired named type (e.g. validated inline via
    // `z.infer<typeof XSchema>` at each use site, never extracted to its own type alias)
    // would otherwise pass silently, since only interfaces/type aliases were scanned before
    // this (PR #399 review, Codex).
    const schemaConstants = sourceFile
      .getVariableStatements()
      .flatMap((statement) => statement.getDeclarations())
      .filter((declaration) => declaration.getName().endsWith('Schema'));

    const declarations: Array<InterfaceDeclaration | TypeAliasDeclaration | VariableDeclaration> = [
      ...sourceFile.getInterfaces(),
      ...sourceFile.getTypeAliases(),
      ...schemaConstants,
    ];

    for (const declaration of declarations) {
      const name = declaration.getName();
      if (isExempt(sourceFile.getFilePath(), name, exceptions)) continue;

      findings.push({
        rule: 'bff-controller-inline-type',
        file: sourceFile.getFilePath(),
        line: sourceLine(sourceFile, declaration.getStart()),
        message: `"${name}" is declared inline in ${sourceFile.getBaseName()}. Response interfaces/type aliases belong in the sibling "<module>.types.ts"; request Zod schemas and their inferred Body/Query types belong in a sibling "<module>.schemas.ts" (mirror booking/bookings.schemas.ts) — re-export from the controller with "export * from './<module>.schemas'" if other files import these symbols from here today.`,
      });
    }
  }

  return { rule: 'bff-controller-inline-type', scannedTargets, findings };
}

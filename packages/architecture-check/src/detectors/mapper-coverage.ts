import { ClassDeclaration, Node, SourceFile, SyntaxKind } from 'ts-morph';

// Verifies a real, executable `err instanceof Target` expression exists — not a text/comment/
// string match — and resolves the right-hand identifier back to the exact class declaration
// (by source file + position), so a same-named class declared in an unrelated file can't
// produce a false "covered" result.
export function hasExecutableInstanceofBranch(
  sourceFile: SourceFile,
  target: ClassDeclaration,
): boolean {
  const targetFile = target.getSourceFile().getFilePath();
  const targetStart = target.getStart();
  return sourceFile.getDescendantsOfKind(SyntaxKind.BinaryExpression).some((expression) => {
    if (expression.getOperatorToken().getKind() !== SyntaxKind.InstanceOfKeyword) return false;
    const symbol = expression.getRight().getSymbol();
    // An identifier referenced via an import resolves to an alias symbol whose own
    // getDeclarations() points at the ImportSpecifier, not the class — getAliasedSymbol()
    // follows it back to the real declaration. Same-file references (no import) aren't
    // aliases, so fall back to the symbol itself.
    const declarations = (symbol?.getAliasedSymbol() ?? symbol)?.getDeclarations();
    return declarations?.some(
      (declaration) =>
        declaration.getSourceFile().getFilePath() === targetFile &&
        declaration.getStart() === targetStart,
    );
  });
}

// A mapper file commonly delegates coverage to a shared/http/*.mapper.ts helper instead of
// repeating "instanceof XxxError" itself (SonarCloud's new-code-duplication gate). Merely
// *importing* that helper isn't proof it's used — an unused/stale import must not count as
// coverage — so this only returns helper files whose imported binding is actually invoked
// as a CallExpression somewhere in the importing file.
export function invokedSharedHttpHelperFiles(sourceFile: SourceFile): SourceFile[] {
  const files: SourceFile[] = [];
  for (const importDeclaration of sourceFile.getImportDeclarations()) {
    const resolved = importDeclaration.getModuleSpecifierSourceFile();
    if (!resolved || !/\/shared\/http\/.*\.ts$/.test(resolved.getFilePath())) continue;

    const localNames = importDeclaration
      .getNamedImports()
      .map((specifier) => (specifier.getAliasNode() ?? specifier.getNameNode()).getText());
    const isInvoked = localNames.some((localName) =>
      sourceFile
        .getDescendantsOfKind(SyntaxKind.CallExpression)
        .some(
          (call) =>
            Node.isIdentifier(call.getExpression()) && call.getExpression().getText() === localName,
        ),
    );
    if (isInvoked) files.push(resolved);
  }
  return files;
}

// The full set of files worth searching for coverage of a class referenced from
// `sourceFile`: the file itself, plus any shared/http/** helper it actually invokes.
export function coverageSearchSpace(sourceFile: SourceFile): SourceFile[] {
  return [sourceFile, ...invokedSharedHttpHelperFiles(sourceFile)];
}

export function isCoveredBy(candidates: SourceFile[], target: ClassDeclaration): boolean {
  return candidates.some((file) => hasExecutableInstanceofBranch(file, target));
}

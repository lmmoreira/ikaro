import { ClassDeclaration, Decorator, Identifier, Node, PropertyDeclaration } from 'ts-morph';

const TYPEORM_MODULE = 'typeorm';

// Resolves an identifier back to the real `typeorm` export it was imported as — not just its
// local (possibly aliased) spelling. `import { Entity as TypeOrmEntity } from 'typeorm'` still
// resolves `exportName: 'Entity'` correctly; a same-named decorator declared locally (e.g. a
// fixture stub, or an unrelated library's own `@Entity`) does not.
function resolvesToTypeOrmExport(identifier: Identifier, exportName: string): boolean {
  const declarations = identifier.getSymbol()?.getDeclarations() ?? [];
  return declarations.some((declaration) => {
    if (!Node.isImportSpecifier(declaration)) return false;
    if (declaration.getName() !== exportName) return false;
    return declaration.getImportDeclaration().getModuleSpecifierValue() === TYPEORM_MODULE;
  });
}

export function findTypeOrmDecorator(
  declaration: ClassDeclaration | PropertyDeclaration,
  exportNames: string[],
): Decorator | undefined {
  return declaration
    .getDecorators()
    .find((decorator) =>
      exportNames.some((name) => resolvesToTypeOrmExport(decorator.getNameNode(), name)),
    );
}

export function hasTypeOrmDecorator(declaration: ClassDeclaration, exportName: string): boolean {
  return findTypeOrmDecorator(declaration, [exportName]) !== undefined;
}

export function implementsTypeOrmInterface(
  declaration: ClassDeclaration,
  exportName: string,
): boolean {
  return declaration.getImplements().some((clause) => {
    const expression = clause.getExpression();
    return Node.isIdentifier(expression) && resolvesToTypeOrmExport(expression, exportName);
  });
}

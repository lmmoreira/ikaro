import { ClassDeclaration, Project, SyntaxKind } from 'ts-morph';

const BUILDER_FILE = /test\/builders\/([^/]+)\/.*\.builder\.ts$/;

export interface BuilderIndexEntry {
  context: string;
  declaration: ClassDeclaration;
}

// Indexes every class declared under src/test/builders/<context>/*.builder.ts, keyed by class
// name, in a SINGLE pass over the project — shared by every detector that needs to look up a
// builder by (name, context) instead of by name alone. A same-named builder in the WRONG context
// must never satisfy coverage (docs/08-TESTING_STRATEGY.md's builder-location rule).
export function indexBuilderClasses(project: Project): Map<string, BuilderIndexEntry[]> {
  const index = new Map<string, BuilderIndexEntry[]>();
  for (const sourceFile of project.getSourceFiles()) {
    const match = BUILDER_FILE.exec(sourceFile.getFilePath());
    if (!match) continue;
    const context = match[1];
    for (const declaration of sourceFile.getDescendantsOfKind(SyntaxKind.ClassDeclaration)) {
      const name = declaration.getName();
      if (!name) continue;
      const entries = index.get(name) ?? [];
      entries.push({ context, declaration });
      index.set(name, entries);
    }
  }
  return index;
}

export function findBuilderInContext(
  index: Map<string, BuilderIndexEntry[]>,
  name: string,
  context: string,
): ClassDeclaration | undefined {
  return index.get(name)?.find((entry) => entry.context === context)?.declaration;
}

export function builderExistsInContext(
  index: Map<string, BuilderIndexEntry[]>,
  name: string,
  context: string,
): boolean {
  return findBuilderInContext(index, name, context) !== undefined;
}

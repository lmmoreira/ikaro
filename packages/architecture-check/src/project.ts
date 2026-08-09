import { dirname, resolve } from 'node:path';
import { Project, type SourceFile } from 'ts-morph';

export function loadProject(root: string, tsconfigPath: string): Project {
  return new Project({
    tsConfigFilePath: resolve(root, tsconfigPath),
    skipAddingFilesFromTsConfig: false,
  });
}

export function loadFixtureProject(sourceFilePath: string): Project {
  const project = new Project({ useInMemoryFileSystem: true });
  project.addSourceFileAtPath(sourceFilePath);
  return project;
}

export function sourceLine(sourceFile: SourceFile, position: number): number {
  return sourceFile.getLineAndColumnAtPos(position).line;
}

export function relativePath(root: string, filePath: string): string {
  return filePath.startsWith(root) ? filePath.slice(dirname(root).length + 1) : filePath;
}

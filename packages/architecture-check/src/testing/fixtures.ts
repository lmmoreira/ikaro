import { Project } from 'ts-morph';
import type { ScanResult } from '../model';

export function fixtureProject(files: Record<string, string>): Project {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [file, text] of Object.entries(files)) project.createSourceFile(file, text);
  return project;
}

export function expectScannedTargets(result: ScanResult, expected: number): void {
  expect(result.scannedTargets).toBe(expected);
}

export function expectZeroTargets(result: ScanResult): void {
  expectScannedTargets(result, 0);
  expect(result.findings).toHaveLength(0);
}

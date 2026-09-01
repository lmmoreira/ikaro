import type { ClosedEnumRegistryEntry } from './closed-enum-registry';
import { checkClosedEnumRegistry } from '../index';
import { expectScannedTargets, expectZeroTargets, fixtureProject } from '../testing/fixtures';

const CANONICAL_FILE = 'packages/validation/src/demo-enum.ts';
const MIRROR_FILE = 'packages/types/src/demo-enum.ts';

function registryFor(
  canonicalMembers: string[],
  mirrorMembers: string[],
): { entry: ClosedEnumRegistryEntry; projects: ReturnType<typeof fixtureProject>[] } {
  const canonicalProject = fixtureProject({
    [CANONICAL_FILE]: `export const DEMO_TYPES = [${canonicalMembers.map((m) => `'${m}'`).join(', ')}] as const;`,
  });
  const mirrorProject = fixtureProject({
    [MIRROR_FILE]: `export type DemoType = ${mirrorMembers.map((m) => `'${m}'`).join(' | ') || 'never'};`,
  });
  return {
    entry: {
      name: 'DemoType',
      canonical: { path: CANONICAL_FILE, kind: 'constArray', exportName: 'DEMO_TYPES' },
      mirror: { path: MIRROR_FILE, kind: 'union', exportName: 'DemoType' },
    },
    projects: [canonicalProject, mirrorProject],
  };
}

describe('checkClosedEnumRegistry', () => {
  it('passes when both sides have the exact same members', () => {
    const { entry, projects } = registryFor(['A', 'B', 'C'], ['A', 'B', 'C']);
    const result = checkClosedEnumRegistry(projects, [entry]);
    expectScannedTargets(result, 1);
    expect(result.findings).toHaveLength(0);
  });

  it('flags the mirror falling behind canonical — strict equality, no allowed staged lag', () => {
    const { entry, projects } = registryFor(['A', 'B', 'C'], ['A', 'B']);
    const result = checkClosedEnumRegistry(projects, [entry]);
    expect(result.findings).toEqual([
      expect.objectContaining({
        rule: 'closed-enum-registry',
        message: expect.stringContaining('missing member(s) [C]'),
      }),
    ]);
  });

  it('flags the mirror gaining a member canonical lacks — the real reversed-direction bug', () => {
    const { entry, projects } = registryFor(['A', 'B'], ['A', 'B', 'C']);
    const result = checkClosedEnumRegistry(projects, [entry]);
    expect(result.findings).toEqual([
      expect.objectContaining({
        rule: 'closed-enum-registry',
        message: expect.stringContaining('member(s) [C] not present in canonical'),
      }),
    ]);
  });

  it('flags both an extra and a missing member in one finding when both sides diverge', () => {
    const { entry, projects } = registryFor(['A', 'B'], ['B', 'C']);
    const result = checkClosedEnumRegistry(projects, [entry]);
    expect(result.findings).toEqual([
      expect.objectContaining({
        message: expect.stringMatching(/member\(s\) \[C\] not present in canonical/),
      }),
    ]);
    expect(result.findings[0].message).toMatch(/missing member\(s\) \[A\]/);
  });

  it('flags an unresolved canonical source instead of silently skipping the entry', () => {
    const { entry, projects } = registryFor(['A'], ['A']);
    const brokenEntry: ClosedEnumRegistryEntry = {
      ...entry,
      canonical: { ...entry.canonical, exportName: 'DOES_NOT_EXIST' },
    };
    const result = checkClosedEnumRegistry(projects, [brokenEntry]);
    expectScannedTargets(result, 1);
    expect(result.findings).toEqual([
      expect.objectContaining({
        message: expect.stringContaining('canonical source'),
      }),
    ]);
  });

  it('flags an unresolved mirror source instead of silently skipping the entry', () => {
    const { entry, projects } = registryFor(['A'], ['A']);
    const brokenEntry: ClosedEnumRegistryEntry = {
      ...entry,
      mirror: { ...entry.mirror, path: 'packages/types/src/does-not-exist.ts' },
    };
    const result = checkClosedEnumRegistry(projects, [brokenEntry]);
    expectScannedTargets(result, 1);
    expect(result.findings).toEqual([
      expect.objectContaining({
        message: expect.stringContaining('mirror source'),
      }),
    ]);
  });

  it('satisfies the zero-target contract for an empty registry', () => {
    const result = checkClosedEnumRegistry([fixtureProject({})], []);
    expectZeroTargets(result);
  });

  // Codex + CodeRabbit, PR #456 round 1: silently filtering out non-string-literal members let a
  // malformed/widened declaration pass the registry's closed-enum guarantee with zero findings —
  // the parser must treat these as unresolved instead.
  describe('malformed or widened declarations are unresolved, not silently filtered', () => {
    it('flags a constArray containing a non-string-literal element', () => {
      const project = fixtureProject({
        [CANONICAL_FILE]: `export const DEMO_TYPES = ['A', 2, 'C'] as const;`,
        [MIRROR_FILE]: `export type DemoType = 'A';`,
      });
      const entry: ClosedEnumRegistryEntry = {
        name: 'DemoType',
        canonical: { path: CANONICAL_FILE, kind: 'constArray', exportName: 'DEMO_TYPES' },
        mirror: { path: MIRROR_FILE, kind: 'union', exportName: 'DemoType' },
      };
      const result = checkClosedEnumRegistry([project], [entry]);
      expectScannedTargets(result, 1);
      expect(result.findings).toEqual([
        expect.objectContaining({ message: expect.stringContaining('canonical source') }),
      ]);
    });

    it('flags a union widened to a bare string type', () => {
      const project = fixtureProject({
        [CANONICAL_FILE]: `export const DEMO_TYPES = ['A'] as const;`,
        [MIRROR_FILE]: `export type DemoType = string;`,
      });
      const entry: ClosedEnumRegistryEntry = {
        name: 'DemoType',
        canonical: { path: CANONICAL_FILE, kind: 'constArray', exportName: 'DEMO_TYPES' },
        mirror: { path: MIRROR_FILE, kind: 'union', exportName: 'DemoType' },
      };
      const result = checkClosedEnumRegistry([project], [entry]);
      expectScannedTargets(result, 1);
      expect(result.findings).toEqual([
        expect.objectContaining({ message: expect.stringContaining('mirror source') }),
      ]);
    });

    it("flags a union widened by an unconstrained member (e.g. 'A' | string)", () => {
      const project = fixtureProject({
        [CANONICAL_FILE]: `export const DEMO_TYPES = ['A'] as const;`,
        [MIRROR_FILE]: `export type DemoType = 'A' | string;`,
      });
      const entry: ClosedEnumRegistryEntry = {
        name: 'DemoType',
        canonical: { path: CANONICAL_FILE, kind: 'constArray', exportName: 'DEMO_TYPES' },
        mirror: { path: MIRROR_FILE, kind: 'union', exportName: 'DemoType' },
      };
      const result = checkClosedEnumRegistry([project], [entry]);
      expectScannedTargets(result, 1);
      expect(result.findings).toEqual([
        expect.objectContaining({ message: expect.stringContaining('mirror source') }),
      ]);
    });
  });
});

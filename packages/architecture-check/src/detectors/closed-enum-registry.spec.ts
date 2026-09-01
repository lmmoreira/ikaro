import type { ClosedEnumRegistryEntry } from './closed-enum-registry';
import { checkClosedEnumRegistry } from '../index';
import { expectScannedTargets, expectZeroTargets, fixtureProject } from '../testing/fixtures';

const CANONICAL_FILE = 'packages/validation/src/demo-enum.ts';
const MAY_LEAD_AHEAD_FILE = 'packages/types/src/demo-enum.ts';

function registryFor(
  canonicalMembers: string[],
  mayLeadAheadMembers: string[],
): { entry: ClosedEnumRegistryEntry; projects: ReturnType<typeof fixtureProject>[] } {
  const canonicalProject = fixtureProject({
    [CANONICAL_FILE]: `export const DEMO_TYPES = [${canonicalMembers.map((m) => `'${m}'`).join(', ')}] as const;`,
  });
  const mayLeadAheadProject = fixtureProject({
    [MAY_LEAD_AHEAD_FILE]: `export type DemoType = ${mayLeadAheadMembers.map((m) => `'${m}'`).join(' | ') || 'never'};`,
  });
  return {
    entry: {
      name: 'DemoType',
      canonical: { path: CANONICAL_FILE, kind: 'constArray', exportName: 'DEMO_TYPES' },
      mayLeadAhead: { path: MAY_LEAD_AHEAD_FILE, kind: 'union', exportName: 'DemoType' },
    },
    projects: [canonicalProject, mayLeadAheadProject],
  };
}

describe('checkClosedEnumRegistry', () => {
  it('passes when both sides have the exact same members', () => {
    const { entry, projects } = registryFor(['A', 'B', 'C'], ['A', 'B', 'C']);
    const result = checkClosedEnumRegistry(projects, [entry]);
    expectScannedTargets(result, 1);
    expect(result.findings).toHaveLength(0);
  });

  it('allows the canonical source to lead ahead — no finding for a staged rollout mid-flight', () => {
    const { entry, projects } = registryFor(['A', 'B', 'C'], ['A', 'B']);
    const result = checkClosedEnumRegistry(projects, [entry]);
    expectScannedTargets(result, 1);
    expect(result.findings).toHaveLength(0);
  });

  it('flags mayLeadAhead gaining a member the canonical source lacks — the real reversed-direction bug', () => {
    const { entry, projects } = registryFor(['A', 'B'], ['A', 'B', 'C']);
    const result = checkClosedEnumRegistry(projects, [entry]);
    expect(result.findings).toEqual([
      expect.objectContaining({
        rule: 'closed-enum-registry',
        message: expect.stringContaining('[C]'),
      }),
    ]);
  });

  it('flags a plain 2-way divergence for a registry entry with no deliberate lead/lag relationship', () => {
    // Both sides diverge in both directions; only the mayLeadAhead-ahead direction is a finding —
    // the detector never special-cases the seeded HotsiteModuleType entry, the rule is generic.
    const { entry, projects } = registryFor(['A', 'B'], ['B', 'C']);
    const result = checkClosedEnumRegistry(projects, [entry]);
    expect(result.findings).toEqual([
      expect.objectContaining({
        message: expect.stringContaining('[C]'),
      }),
    ]);
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

  it('flags an unresolved mayLeadAhead source instead of silently skipping the entry', () => {
    const { entry, projects } = registryFor(['A'], ['A']);
    const brokenEntry: ClosedEnumRegistryEntry = {
      ...entry,
      mayLeadAhead: { ...entry.mayLeadAhead, path: 'packages/types/src/does-not-exist.ts' },
    };
    const result = checkClosedEnumRegistry(projects, [brokenEntry]);
    expectScannedTargets(result, 1);
    expect(result.findings).toEqual([
      expect.objectContaining({
        message: expect.stringContaining('mayLeadAhead source'),
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
        [MAY_LEAD_AHEAD_FILE]: `export type DemoType = 'A';`,
      });
      const entry: ClosedEnumRegistryEntry = {
        name: 'DemoType',
        canonical: { path: CANONICAL_FILE, kind: 'constArray', exportName: 'DEMO_TYPES' },
        mayLeadAhead: { path: MAY_LEAD_AHEAD_FILE, kind: 'union', exportName: 'DemoType' },
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
        [MAY_LEAD_AHEAD_FILE]: `export type DemoType = string;`,
      });
      const entry: ClosedEnumRegistryEntry = {
        name: 'DemoType',
        canonical: { path: CANONICAL_FILE, kind: 'constArray', exportName: 'DEMO_TYPES' },
        mayLeadAhead: { path: MAY_LEAD_AHEAD_FILE, kind: 'union', exportName: 'DemoType' },
      };
      const result = checkClosedEnumRegistry([project], [entry]);
      expectScannedTargets(result, 1);
      expect(result.findings).toEqual([
        expect.objectContaining({ message: expect.stringContaining('mayLeadAhead source') }),
      ]);
    });

    it("flags a union widened by an unconstrained member (e.g. 'A' | string)", () => {
      const project = fixtureProject({
        [CANONICAL_FILE]: `export const DEMO_TYPES = ['A'] as const;`,
        [MAY_LEAD_AHEAD_FILE]: `export type DemoType = 'A' | string;`,
      });
      const entry: ClosedEnumRegistryEntry = {
        name: 'DemoType',
        canonical: { path: CANONICAL_FILE, kind: 'constArray', exportName: 'DEMO_TYPES' },
        mayLeadAhead: { path: MAY_LEAD_AHEAD_FILE, kind: 'union', exportName: 'DemoType' },
      };
      const result = checkClosedEnumRegistry([project], [entry]);
      expectScannedTargets(result, 1);
      expect(result.findings).toEqual([
        expect.objectContaining({ message: expect.stringContaining('mayLeadAhead source') }),
      ]);
    });
  });
});

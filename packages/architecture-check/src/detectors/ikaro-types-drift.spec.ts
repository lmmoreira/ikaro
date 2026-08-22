import { checkIkaroTypesDrift } from '../index';
import { expectScannedTargets, expectZeroTargets, fixtureProject } from '../testing/fixtures';

const TYPES_INDEX = 'packages/types/src/index.ts';
const TYPES_DTO = 'packages/types/src/demo.dto.ts';
const WEB_API_FILE = 'apps/web/features/demo/api.ts';

function typesProjectWith(dtoBody: string) {
  return fixtureProject({
    [TYPES_INDEX]: `export * from './demo.dto';`,
    [TYPES_DTO]: dtoBody,
  });
}

describe('checkIkaroTypesDrift', () => {
  it('flags a structurally identical duplicate, recommending the shared import', () => {
    const webProject = fixtureProject({
      [WEB_API_FILE]: `export interface DemoResponse { id: string; name: string }`,
    });
    const typesProject = typesProjectWith(
      `export interface DemoResponse { id: string; name: string }`,
    );

    const result = checkIkaroTypesDrift(webProject, typesProject);
    expectScannedTargets(result, 1);
    expect(result.findings).toEqual([
      expect.objectContaining({
        rule: 'ikaro-types-drift',
        message: expect.stringContaining('import it from "@ikaro/types"'),
      }),
    ]);
  });

  it('flags a field missing on the web side', () => {
    const webProject = fixtureProject({
      [WEB_API_FILE]: `export interface DemoResponse { id: string }`,
    });
    const typesProject = typesProjectWith(
      `export interface DemoResponse { id: string; name: string }`,
    );

    const result = checkIkaroTypesDrift(webProject, typesProject);
    expect(result.findings).toEqual([
      expect.objectContaining({
        message: expect.stringContaining('missing field "name" (present in @ikaro/types)'),
      }),
    ]);
  });

  it('flags a field present on the web side but not in @ikaro/types', () => {
    const webProject = fixtureProject({
      [WEB_API_FILE]: `export interface DemoResponse { id: string; extra: string }`,
    });
    const typesProject = typesProjectWith(`export interface DemoResponse { id: string }`);

    const result = checkIkaroTypesDrift(webProject, typesProject);
    expect(result.findings).toEqual([
      expect.objectContaining({
        message: expect.stringContaining('extra field "extra" (not present in @ikaro/types)'),
      }),
    ]);
  });

  it('flags a same-named field with a different type — the LoyaltyEntryItem/LoyaltyRedemptionItem class of drift', () => {
    const webProject = fixtureProject({
      [WEB_API_FILE]: `export interface DemoResponse { id: string; points: string }`,
    });
    const typesProject = typesProjectWith(
      `export interface DemoResponse { id: string; points: number }`,
    );

    const result = checkIkaroTypesDrift(webProject, typesProject);
    expect(result.findings).toEqual([
      expect.objectContaining({
        message: expect.stringContaining(
          'field "points" type mismatch: web has "string", @ikaro/types has "number"',
        ),
      }),
    ]);
  });

  it('flags a nullability mismatch as its own drift category, same severity as a type mismatch', () => {
    const webProject = fixtureProject({
      [WEB_API_FILE]: `export interface DemoResponse { id: string; name: string }`,
    });
    const typesProject = typesProjectWith(
      `export interface DemoResponse { id: string; name: string | null }`,
    );

    const result = checkIkaroTypesDrift(webProject, typesProject);
    expect(result.findings).toEqual([
      expect.objectContaining({
        message: expect.stringContaining(
          'field "name" nullability mismatch: web is required, non-null, @ikaro/types is nullable',
        ),
      }),
    ]);
  });

  it('flags an optional-vs-required mismatch under the same nullability category', () => {
    const webProject = fixtureProject({
      [WEB_API_FILE]: `export interface DemoResponse { id: string; name?: string }`,
    });
    const typesProject = typesProjectWith(
      `export interface DemoResponse { id: string; name: string }`,
    );

    const result = checkIkaroTypesDrift(webProject, typesProject);
    expect(result.findings).toEqual([
      expect.objectContaining({
        message: expect.stringContaining(
          'field "name" nullability mismatch: web is optional/undefined, @ikaro/types is required, non-null',
        ),
      }),
    ]);
  });

  it('does not flag a nested object field that is structurally identical on both sides', () => {
    const webProject = fixtureProject({
      [WEB_API_FILE]: `export interface DemoResponse { id: string; address: { city: string; zip: string | null } }`,
    });
    const typesProject = typesProjectWith(
      `export interface DemoResponse { id: string; address: { city: string; zip: string | null } }`,
    );

    const result = checkIkaroTypesDrift(webProject, typesProject);
    expect(result.findings).toEqual([
      expect.objectContaining({
        message: expect.stringContaining('import it from "@ikaro/types"'),
      }),
    ]);
  });

  it('does not flag a name with no @ikaro/types collision', () => {
    const webProject = fixtureProject({
      [WEB_API_FILE]: `export interface DemoOnlyOnWeb { id: string }`,
    });
    const typesProject = typesProjectWith(`export interface DemoResponse { id: string }`);

    const result = checkIkaroTypesDrift(webProject, typesProject);
    expectScannedTargets(result, 1);
    expect(result.findings).toHaveLength(0);
  });

  it('does not flag a non-exported local declaration even if its name collides', () => {
    const webProject = fixtureProject({
      [WEB_API_FILE]: `
        interface DemoResponse { id: string; totallyDifferent: boolean }
        export function noop(): DemoResponse { return { id: '1', totallyDifferent: true }; }
      `,
    });
    const typesProject = typesProjectWith(`export interface DemoResponse { id: string }`);

    const result = checkIkaroTypesDrift(webProject, typesProject);
    expect(result.findings).toHaveLength(0);
  });

  it('respects a documented exception', () => {
    const webProject = fixtureProject({
      [WEB_API_FILE]: `export interface DemoResponse { id: string; legacyField: boolean }`,
    });
    const typesProject = typesProjectWith(`export interface DemoResponse { id: string }`);

    const result = checkIkaroTypesDrift(webProject, typesProject, [
      { path: WEB_API_FILE, name: 'DemoResponse' },
    ]);
    expectScannedTargets(result, 1);
    expect(result.findings).toHaveLength(0);
  });

  it('reports zero targets when no web transport-boundary file exists', () => {
    const webProject = fixtureProject({
      'apps/web/app/dashboard/page.tsx': `export default function Page() { return null; }`,
    });
    const typesProject = typesProjectWith(`export interface DemoResponse { id: string }`);

    expectZeroTargets(checkIkaroTypesDrift(webProject, typesProject));
  });

  it('scans apps/web/shared/lib/api/** in addition to feature api modules', () => {
    const webProject = fixtureProject({
      'apps/web/shared/lib/api/errors.ts': `export interface DemoResponse { id: string; extra: boolean }`,
    });
    const typesProject = typesProjectWith(`export interface DemoResponse { id: string }`);

    const result = checkIkaroTypesDrift(webProject, typesProject);
    expectScannedTargets(result, 1);
    expect(result.findings).toEqual([
      expect.objectContaining({
        message: expect.stringContaining('extra field "extra"'),
      }),
    ]);
  });
});

import { checkIkaroTypesDrift } from '../index';
import { expectScannedTargets, expectZeroTargets, fixtureProject } from '../testing/fixtures';

const TYPES_INDEX = 'packages/types/src/index.ts';
const TYPES_DTO = 'packages/types/src/demo.dto.ts';
const WEB_API_FILE = 'apps/web/features/demo/api.ts';

function typesProjectWith(dtoBody: string): ReturnType<typeof fixtureProject> {
  return fixtureProject({
    [TYPES_INDEX]: `export * from './demo.dto';`,
    [TYPES_DTO]: dtoBody,
  });
}

// Builds `{ level: { level: ... leafType ... } }` nested `depth` levels deep, to exercise the
// detector's depth-cutoff path (packages/architecture-check/src/detectors/ikaro-types-drift.ts's
// MAX_WALK_DEPTH) without hand-typing dozens of nesting levels.
function nestedObjectType(depth: number, leafType: string): string {
  let type = leafType;
  for (let i = 0; i < depth; i++) type = `{ level: ${type} }`;
  return type;
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

  // PR #402 review (CodeRabbit): getProperties() returns nothing for a Record<K, V>/index-signature
  // type, so a nested Record field with a different value type would previously normalize to the
  // same empty "{ }" shape on both sides and silently pass.
  it('flags a nested Record field whose value type differs from @ikaro/types', () => {
    const webProject = fixtureProject({
      [WEB_API_FILE]: `export interface DemoResponse { id: string; metadata: Record<string, string> }`,
    });
    const typesProject = typesProjectWith(
      `export interface DemoResponse { id: string; metadata: Record<string, number> }`,
    );

    const result = checkIkaroTypesDrift(webProject, typesProject);
    expect(result.findings).toEqual([
      expect.objectContaining({
        message: expect.stringContaining('field "metadata" type mismatch'),
      }),
    ]);
  });

  it('does not flag a nested Record field with an identical value type', () => {
    const webProject = fixtureProject({
      [WEB_API_FILE]: `export interface DemoResponse { id: string; metadata: Record<string, string> }`,
    });
    const typesProject = typesProjectWith(
      `export interface DemoResponse { id: string; metadata: Record<string, string> }`,
    );

    const result = checkIkaroTypesDrift(webProject, typesProject);
    expect(result.findings).toEqual([
      expect.objectContaining({
        message: expect.stringContaining('import it from "@ikaro/types"'),
      }),
    ]);
  });

  // PR #402 review (Codex + CodeRabbit): a top-level declaration that isn't a finite named-property
  // object (a primitive/union/array/Record alias) has zero properties on both sides via
  // fieldSignatures() alone, so it previously always compared as an identical duplicate regardless
  // of its actual — possibly completely different — shape.
  it('flags a root-level primitive type alias that drifted from @ikaro/types', () => {
    const webProject = fixtureProject({
      [WEB_API_FILE]: `export type DemoAlias = string;`,
    });
    const typesProject = typesProjectWith(`export type DemoAlias = number;`);

    const result = checkIkaroTypesDrift(webProject, typesProject);
    expect(result.findings).toEqual([
      expect.objectContaining({
        message: expect.stringContaining('"DemoAlias" has drifted from @ikaro/types\' "DemoAlias"'),
      }),
    ]);
  });

  it('flags a root-level union type alias that drifted from @ikaro/types', () => {
    const webProject = fixtureProject({
      [WEB_API_FILE]: `export type DemoUnion = 'A' | 'B';`,
    });
    const typesProject = typesProjectWith(`export type DemoUnion = 'A' | 'C';`);

    const result = checkIkaroTypesDrift(webProject, typesProject);
    expect(result.findings).toHaveLength(1);
  });

  it('flags a root-level Record type alias that drifted from @ikaro/types', () => {
    const webProject = fixtureProject({
      [WEB_API_FILE]: `export type DemoMap = Record<string, string>;`,
    });
    const typesProject = typesProjectWith(`export type DemoMap = Record<string, number>;`);

    const result = checkIkaroTypesDrift(webProject, typesProject);
    expect(result.findings).toHaveLength(1);
  });

  it('does not flag an identical root-level primitive type alias', () => {
    const webProject = fixtureProject({
      [WEB_API_FILE]: `export type DemoAlias = string;`,
    });
    const typesProject = typesProjectWith(`export type DemoAlias = string;`);

    const result = checkIkaroTypesDrift(webProject, typesProject);
    expect(result.findings).toEqual([
      expect.objectContaining({
        message: expect.stringContaining('import it from "@ikaro/types"'),
      }),
    ]);
  });

  // Codex (PR #402): the depth cutoff previously returned a constant "<max-depth>" marker for
  // every shape beyond it, so two DIFFERENT deeply-nested shapes silently compared as identical.
  it('still catches a mismatch nested deeper than the walk-depth cutoff', () => {
    // 55 levels: past MAX_WALK_DEPTH (50) — proves the cutoff fallback still distinguishes an
    // anonymous object literal's remaining structure instead of collapsing to a constant marker.
    const webProject = fixtureProject({
      [WEB_API_FILE]: `export interface DeepDemo { id: string; nested: ${nestedObjectType(55, 'string')} }`,
    });
    const typesProject = typesProjectWith(
      `export interface DeepDemo { id: string; nested: ${nestedObjectType(55, 'number')} }`,
    );

    const result = checkIkaroTypesDrift(webProject, typesProject);
    expect(result.findings).toEqual([
      expect.objectContaining({
        message: expect.stringContaining('field "nested" type mismatch'),
      }),
    ]);
  });

  // Codex (PR #402): the transport-file matcher previously required "api" exactly one segment
  // below features/, silently excluding a sub-feature's own nested api/ directory such as the
  // real apps/web/features/platform/hotsite/api/**.
  it('scans a sub-feature api directory nested more than one segment below features/', () => {
    const webProject = fixtureProject({
      'apps/web/features/platform/hotsite/api/chatbot.ts': `export interface DemoResponse { id: string; extra: boolean }`,
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

  // Codex (PR #402): a function/call-signature type has zero named properties, so a same-named
  // colliding function type alias would previously always normalize to the same empty "{ }"
  // shape and be reported as an identical duplicate regardless of its actual signature.
  it('flags a root-level function type alias whose signature drifted from @ikaro/types', () => {
    const webProject = fixtureProject({
      [WEB_API_FILE]: `export type DemoCallback = () => string;`,
    });
    const typesProject = typesProjectWith(`export type DemoCallback = () => number;`);

    const result = checkIkaroTypesDrift(webProject, typesProject);
    expect(result.findings).toEqual([
      expect.objectContaining({
        message: expect.stringContaining(
          '"DemoCallback" has drifted from @ikaro/types\' "DemoCallback"',
        ),
      }),
    ]);
  });

  it('does not flag an identical root-level function type alias', () => {
    const webProject = fixtureProject({
      [WEB_API_FILE]: `export type DemoCallback = () => string;`,
    });
    const typesProject = typesProjectWith(`export type DemoCallback = () => string;`);

    const result = checkIkaroTypesDrift(webProject, typesProject);
    expect(result.findings).toEqual([
      expect.objectContaining({
        message: expect.stringContaining('import it from "@ikaro/types"'),
      }),
    ]);
  });
});

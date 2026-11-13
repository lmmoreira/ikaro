import { checkTenantAccessRouteMetadata, classifyScanResults } from '../index';
import { expectScannedTargets, expectZeroTargets, fixtureProject } from '../testing/fixtures';

const POLICY = {
  mode: 'warn' as const,
  entitlementDecorators: ['RequiresFeature', 'NoFeatureGate'],
  suspensionDecorators: ['SuspensionAccess'],
};
const FILE = 'apps/backend/src/contexts/demo/demo.controller.ts';

function scan(source: string, policy = POLICY) {
  return checkTenantAccessRouteMetadata([fixtureProject({ [FILE]: source })], policy);
}

describe('checkTenantAccessRouteMetadata', () => {
  describe('positive fixtures (declared routes pass)', () => {
    it('passes a handler that declares its feature and its suspension policy', () => {
      const result = scan(`
        @Controller('demo')
        export class DemoController {
          @Get()
          @RequiresFeature('BOOKING')
          @SuspensionAccess('DEFAULT_DENY')
          list() {}
        }
      `);
      expectScannedTargets(result, 1);
      expect(result.findings).toEqual([]);
    });

    it('accepts @NoFeatureGate as the entitlement declaration', () => {
      const result = scan(`
        @Controller('health')
        export class HealthController {
          @Get()
          @NoFeatureGate()
          @SuspensionAccess('ANY_AUTHENTICATED')
          ping() {}
        }
      `);
      expect(result.findings).toEqual([]);
    });

    it('lets a class-level declaration cover every route of the controller', () => {
      const result = scan(`
        @RequiresFeature('LOYALTY')
        @SuspensionAccess('CUSTOMER_HISTORY')
        @Controller('loyalty')
        export class LoyaltyController {
          @Get() balance() {}
          @Post() redeem() {}
        }
      `);
      expectScannedTargets(result, 2);
      expect(result.findings).toEqual([]);
    });
  });

  describe('negative fixtures (a route without both declarations is flagged)', () => {
    it('flags a route with no metadata, naming the file, line, route and remediation', () => {
      const result = scan(`
        @Controller('demo')
        export class DemoController {
          @Get()
          list() {}
        }
      `);
      expectScannedTargets(result, 1);
      expect(result.findings).toEqual([
        expect.objectContaining({
          rule: 'tenant-access-route-metadata',
          file: expect.stringContaining('contexts/demo/demo.controller.ts'),
          line: 4,
          message: expect.stringMatching(
            /DemoController\.list.*entitlement declaration.*suspension policy.*Tenant access enforcement/s,
          ),
        }),
      ]);
    });

    it('flags a route that declares a feature but no explicit suspension policy', () => {
      const result = scan(`
        @Controller('demo')
        export class DemoController {
          @Get() @RequiresFeature('BOOKING') list() {}
        }
      `);
      expect(result.findings).toHaveLength(1);
      expect(result.findings[0].message).toContain('suspension policy');
      expect(result.findings[0].message).not.toContain('entitlement declaration');
    });

    it('flags a route that declares a suspension policy but no entitlement', () => {
      const result = scan(`
        @Controller('demo')
        export class DemoController {
          @Get() @SuspensionAccess('DEFAULT_DENY') list() {}
        }
      `);
      expect(result.findings).toHaveLength(1);
      expect(result.findings[0].message).toContain('entitlement declaration');
    });

    it('flags only the unannotated route of a controller', () => {
      const result = scan(`
        @Controller('demo')
        export class DemoController {
          @Get() @NoFeatureGate() @SuspensionAccess('DEFAULT_DENY') ok() {}
          @Delete() bare() {}
        }
      `);
      expectScannedTargets(result, 2);
      expect(result.findings).toHaveLength(1);
      expect(result.findings[0].message).toContain('DemoController.bare');
    });

    it('ignores a method that is not a route and a class that is not a controller', () => {
      const result = scan(`
        @Controller('demo')
        export class DemoController {
          helper() {}
        }
        export class Plain { @Get() notARoute() {} }
      `);
      expectZeroTargets(result);
    });
  });

  describe('the documented bypass shapes still count as a declaration', () => {
    // docs/ENGINEERING_RULES_SHARED.md § `no-restricted-syntax` selectors must be checked against
    // every already-documented bypass shape: the same three classes apply to a decorator reference.
    it('1. a computed-literal or namespaced reference', () => {
      const result = scan(`
        import * as gates from '../gates';
        @Controller('demo')
        export class DemoController {
          @Get()
          @gates.RequiresFeature('BOOKING')
          @gates['SuspensionAccess']('DEFAULT_DENY')
          list() {}
        }
      `);
      expect(result.findings).toEqual([]);
    });

    it('2. an aliased import and a bare reference with no call', () => {
      const result = scan(`
        import { RequiresFeature as Gate, SuspensionAccess } from '../gates';
        @Controller('demo')
        export class DemoController {
          @Get()
          @Gate('BOOKING')
          @SuspensionAccess
          list() {}
        }
      `);
      expect(result.findings).toEqual([]);
    });

    it('3. a declaration nested inside applyDecorators(...)', () => {
      const result = scan(`
        @Controller('demo')
        export class DemoController {
          @Get()
          @applyDecorators(RequiresFeature('BOOKING'), SuspensionAccess('DEFAULT_DENY'))
          list() {}
        }
      `);
      expect(result.findings).toEqual([]);
    });

    it('4. a parenthesised reference, for the route decorator and the gate decorators alike', () => {
      const result = scan(`
        import * as gates from '../gates';
        @Controller('demo')
        export class DemoController {
          @(Get)()
          @(gates['RequiresFeature'])('BOOKING')
          @((gates).SuspensionAccess)('DEFAULT_DENY')
          list() {}
        }
      `);
      // The route is scanned (not merely absent from the findings) and counts as declared.
      expectScannedTargets(result, 1);
      expect(result.findings).toEqual([]);
    });

    it('4b. a parenthesised route with no declaration is still scanned and flagged', () => {
      const result = scan(`
        @Controller('demo')
        export class DemoController {
          @(Post)()
          create() {}
        }
      `);
      expectScannedTargets(result, 1);
      expect(result.findings).toHaveLength(1);
    });

    it('does not count an unrelated decorator that merely resembles one', () => {
      const result = scan(`
        @Controller('demo')
        export class DemoController {
          @Get()
          @Roles('MANAGER')
          list() {}
        }
      `);
      expect(result.findings).toHaveLength(1);
    });
  });

  it('reads the decorator names from the policy, so a new gating decorator is one policy entry', () => {
    const source = `
      @Controller('demo')
      export class DemoController {
        @Get() @RequiresQuota('X') @SuspensionAccess('DEFAULT_DENY') list() {}
      }
    `;
    expect(scan(source).findings).toHaveLength(1);
    expect(
      scan(source, {
        ...POLICY,
        entitlementDecorators: [...POLICY.entitlementDecorators, 'RequiresQuota'],
      }).findings,
    ).toEqual([]);
  });

  it('scans every project it is given and counts the routes across them', () => {
    const backend = fixtureProject({
      [FILE]: `@Controller('a') export class A { @Get() one() {} }`,
    });
    const bff = fixtureProject({
      'apps/bff/src/features/demo/demo.controller.ts': `@Controller('b') export class B { @Get() two() {} @Post() three() {} }`,
    });
    const result = checkTenantAccessRouteMetadata([backend, bff], POLICY);
    expectScannedTargets(result, 3);
    expect(result.findings).toHaveLength(3);
  });
});

describe('classifyScanResults (the CLI exit-code contract)', () => {
  const finding = { rule: 'tenant-access-route-metadata', file: 'a.ts', line: 1, message: 'm' };
  const results = [
    { rule: 'tenant-access-route-metadata', scannedTargets: 1, findings: [finding] },
  ];

  it('warn mode: the finding is reported as a warning and the run does not fail', () => {
    const outcome = classifyScanResults(results, new Set(['tenant-access-route-metadata']));
    expect(outcome.warnings).toEqual([finding]);
    expect(outcome.errors).toEqual([]);
    expect(outcome.failed).toBe(false);
  });

  it('error mode: the same finding is an error and the run fails', () => {
    const outcome = classifyScanResults(results, new Set());
    expect(outcome.warnings).toEqual([]);
    expect(outcome.errors).toEqual([finding]);
    expect(outcome.failed).toBe(true);
  });

  it('a result that scanned zero targets fails even in warn mode', () => {
    const outcome = classifyScanResults(
      [{ rule: 'tenant-access-route-metadata', scannedTargets: 0, findings: [] }],
      new Set(['tenant-access-route-metadata']),
    );
    expect(outcome.failed).toBe(true);
  });

  it('keeps every other rule an error while one rule is in warn mode', () => {
    const other = { rule: 'transactional-save', file: 'b.ts', line: 2, message: 'm' };
    const outcome = classifyScanResults(
      [...results, { rule: 'transactional-save', scannedTargets: 1, findings: [other] }],
      new Set(['tenant-access-route-metadata']),
    );
    expect(outcome.errors).toEqual([other]);
    expect(outcome.failed).toBe(true);
  });
});

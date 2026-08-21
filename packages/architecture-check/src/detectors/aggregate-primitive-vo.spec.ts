import { checkAggregatePropsUseSharedValueObjects, type AggregateValueObjectConcept } from '../index';
import { expectScannedTargets, expectZeroTargets, fixtureProject } from '../testing/fixtures';

const REGISTRY: AggregateValueObjectConcept[] = [
  {
    requiredType: 'Email',
    voFile: 'apps/backend/src/shared/value-objects/email.vo.ts',
    exactNames: ['email'],
    suffixes: ['Email'],
  },
  {
    requiredType: 'PhoneNumber',
    voFile: 'apps/backend/src/shared/value-objects/phone-number.vo.ts',
    exactNames: ['phone'],
    suffixes: ['Phone', 'PhoneNumber'],
  },
  {
    requiredType: 'HexColor',
    voFile: 'apps/backend/src/shared/value-objects/hex-color.vo.ts',
    exactNames: ['color'],
    suffixes: ['Color'],
  },
];

describe('checkAggregatePropsUseSharedValueObjects', () => {
  it('flags a primitive field where a VO already exists for that exact concept, while allowing the correctly-typed sibling', () => {
    const project = fixtureProject({
      '/repo/apps/backend/src/contexts/demo/domain/demo.aggregate.ts': `
        class PhoneNumber {}
        interface DemoProps {
          contactEmail: string;
          contactPhone: PhoneNumber;
        }
        class Demo {
          private readonly props: DemoProps;
        }
      `,
    });
    const result = checkAggregatePropsUseSharedValueObjects(project, REGISTRY);
    expectScannedTargets(result, 2);
    expect(result.findings).toEqual([
      expect.objectContaining({
        rule: 'aggregate-primitive-vo',
        message: expect.stringContaining('Demo.contactEmail'),
      }),
    ]);
  });

  it('recurses into a plain nested object shape belonging to the same props tree', () => {
    const project = fixtureProject({
      '/repo/apps/backend/src/contexts/demo/domain/demo.aggregate.ts': `
        interface BrandingProps {
          primaryColor: string;
        }
        interface DemoProps {
          branding: BrandingProps;
        }
        class Demo {
          private readonly props: DemoProps;
        }
      `,
    });
    const result = checkAggregatePropsUseSharedValueObjects(project, REGISTRY);
    expectScannedTargets(result, 1);
    expect(result.findings).toEqual([
      expect.objectContaining({
        rule: 'aggregate-primitive-vo',
        message: expect.stringContaining('Demo.primaryColor'),
      }),
    ]);
  });

  it('does not recurse past a class-typed (VO-encapsulated) field, even when its internal shape would otherwise match a concept', () => {
    const project = fixtureProject({
      '/repo/apps/backend/src/contexts/demo/domain/demo.aggregate.ts': `
        class SettingsVo {
          private readonly primaryColor: string = '';
        }
        interface DemoProps {
          brandColor: SettingsVo;
        }
        class Demo {
          private readonly props: DemoProps;
        }
      `,
    });
    const result = checkAggregatePropsUseSharedValueObjects(project, REGISTRY);
    // Only the outer "brandColor" field is a candidate — SettingsVo's internal primaryColor
    // field is never visited. Proves recursion stops at the class boundary, not merely that the
    // finding happens to be suppressed for some other reason.
    expectScannedTargets(result, 1);
    expect(result.findings).toHaveLength(0);
  });

  it('allows a registered public-transport primitive via a documented exception', () => {
    const project = fixtureProject({
      '/repo/apps/backend/src/contexts/demo/domain/demo.aggregate.ts': `
        interface DemoProps {
          supportEmail: string;
        }
        class Demo {
          private readonly props: DemoProps;
        }
      `,
    });
    const result = checkAggregatePropsUseSharedValueObjects(project, REGISTRY, [
      {
        path: 'apps/backend/src/contexts/demo/domain/demo.aggregate.ts',
        property: 'supportEmail',
      },
    ]);
    expectScannedTargets(result, 1);
    expect(result.findings).toHaveLength(0);
  });

  it('does not flag a primitive field with no registered VO concept', () => {
    const project = fixtureProject({
      '/repo/apps/backend/src/contexts/demo/domain/demo.aggregate.ts': `
        interface DemoProps {
          notes: string;
        }
        class Demo {
          private readonly props: DemoProps;
        }
      `,
    });
    expectZeroTargets(checkAggregatePropsUseSharedValueObjects(project, REGISTRY));
  });

  it('fails the zero-target contract when no aggregate file exists', () => {
    const project = fixtureProject({
      '/repo/apps/backend/src/contexts/demo/application/demo.use-case.ts': `
        export class DemoUseCase {}
      `,
    });
    expectZeroTargets(checkAggregatePropsUseSharedValueObjects(project, REGISTRY));
  });
});

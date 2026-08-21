import {
  checkPrimitiveFieldsValidatedAtConstruction,
  type ConstructionValidationTarget,
} from '../index';
import { expectScannedTargets, expectZeroTargets, fixtureProject } from '../testing/fixtures';

const TARGET: ConstructionValidationTarget = {
  ownerClass: 'DemoSettings',
  ownerFile: 'apps/backend/src/contexts/demo/domain/demo-settings.vo.ts',
  propertyPath: 'businessInfo.email',
  requiredVo: 'Email',
  requiredVoFile: 'apps/backend/src/shared/value-objects/email.vo.ts',
  validatorFile: 'apps/backend/src/contexts/demo/domain/validators/business-info.validator.ts',
};

const EMAIL_VO = `
  export class Email {
    static isValid(value: string): boolean { return value.includes('@'); }
    static create(value: string): Email { return new Email(); }
  }
`;

describe('checkPrimitiveFieldsValidatedAtConstruction', () => {
  it("passes when the delegated validator normalizes via the required VO's create()", () => {
    const project = fixtureProject({
      '/repo/apps/backend/src/shared/value-objects/email.vo.ts': EMAIL_VO,
      '/repo/apps/backend/src/contexts/demo/domain/validators/business-info.validator.ts': `
        import { Email } from '../../../../shared/value-objects/email.vo';
        interface BusinessInfo { email: string | null }
        export class BusinessInfoValidator {
          static validate(businessInfo: BusinessInfo): void {
            if (businessInfo.email != null) Email.create(businessInfo.email);
          }
        }
      `,
      '/repo/apps/backend/src/contexts/demo/domain/demo-settings.vo.ts': `
        import { BusinessInfoValidator } from './validators/business-info.validator';
        export class DemoSettings {
          static create(props: unknown): DemoSettings {
            BusinessInfoValidator.validate((props as { businessInfo: { email: string | null } }).businessInfo);
            return new DemoSettings();
          }
        }
      `,
    });
    expectScannedTargets(checkPrimitiveFieldsValidatedAtConstruction(project, [TARGET]), 1);
    expect(checkPrimitiveFieldsValidatedAtConstruction(project, [TARGET]).findings).toHaveLength(0);
  });

  it('passes when the owner class itself normalizes post-validation, not the delegated validator', () => {
    const project = fixtureProject({
      '/repo/apps/backend/src/shared/value-objects/email.vo.ts': EMAIL_VO,
      '/repo/apps/backend/src/contexts/demo/domain/validators/business-info.validator.ts': `
        import { Email } from '../../../../shared/value-objects/email.vo';
        interface BusinessInfo { email: string | null }
        export class BusinessInfoValidator {
          static validate(businessInfo: BusinessInfo): void {
            if (businessInfo.email != null && !Email.isValid(businessInfo.email)) throw new Error('invalid');
          }
        }
      `,
      '/repo/apps/backend/src/contexts/demo/domain/demo-settings.vo.ts': `
        import { Email } from '../../../shared/value-objects/email.vo';
        import { BusinessInfoValidator } from './validators/business-info.validator';
        interface BusinessInfo { email: string | null }
        export class DemoSettings {
          static create(props: { businessInfo: BusinessInfo }): DemoSettings {
            BusinessInfoValidator.validate(props.businessInfo);
            const email = props.businessInfo.email == null ? null : Email.create(props.businessInfo.email).address;
            return new DemoSettings();
          }
        }
      `,
    });
    const result = checkPrimitiveFieldsValidatedAtConstruction(project, [TARGET]);
    expectScannedTargets(result, 1);
    expect(result.findings).toHaveLength(0);
  });

  it('flags a field that is format-validated via isValid() but never normalized via create()', () => {
    const project = fixtureProject({
      '/repo/apps/backend/src/shared/value-objects/email.vo.ts': EMAIL_VO,
      '/repo/apps/backend/src/contexts/demo/domain/validators/business-info.validator.ts': `
        import { Email } from '../../../../shared/value-objects/email.vo';
        interface BusinessInfo { email: string | null }
        export class BusinessInfoValidator {
          static validate(businessInfo: BusinessInfo): void {
            if (businessInfo.email != null && !Email.isValid(businessInfo.email)) throw new Error('invalid');
          }
        }
      `,
      '/repo/apps/backend/src/contexts/demo/domain/demo-settings.vo.ts': `
        import { BusinessInfoValidator } from './validators/business-info.validator';
        export class DemoSettings {
          static create(props: unknown): DemoSettings {
            BusinessInfoValidator.validate((props as { businessInfo: { email: string | null } }).businessInfo);
            return new DemoSettings();
          }
        }
      `,
    });
    const result = checkPrimitiveFieldsValidatedAtConstruction(project, [TARGET]);
    expectScannedTargets(result, 1);
    expect(result.findings).toEqual([
      expect.objectContaining({
        rule: 'vo-construction-validation',
        message: expect.stringContaining('DemoSettings.businessInfo.email'),
      }),
    ]);
  });

  it('flags a stale registry entry whose owner no longer invokes the registered validator', () => {
    const project = fixtureProject({
      '/repo/apps/backend/src/shared/value-objects/email.vo.ts': EMAIL_VO,
      '/repo/apps/backend/src/contexts/demo/domain/validators/business-info.validator.ts': `
        import { Email } from '../../../../shared/value-objects/email.vo';
        interface BusinessInfo { email: string | null }
        export class BusinessInfoValidator {
          static validate(businessInfo: BusinessInfo): void {
            if (businessInfo.email != null) Email.create(businessInfo.email);
          }
        }
      `,
      '/repo/apps/backend/src/contexts/demo/domain/demo-settings.vo.ts': `
        export class DemoSettings {
          static create(): DemoSettings {
            return new DemoSettings();
          }
        }
      `,
    });
    const result = checkPrimitiveFieldsValidatedAtConstruction(project, [TARGET]);
    expectScannedTargets(result, 1);
    expect(result.findings).toEqual([
      expect.objectContaining({
        rule: 'vo-construction-validation',
        message: expect.stringContaining('no longer invokes'),
      }),
    ]);
  });

  it('does not match an unrelated import that merely happens to also expose a create() call', () => {
    const project = fixtureProject({
      '/repo/apps/backend/src/shared/value-objects/email.vo.ts': EMAIL_VO,
      '/repo/apps/backend/src/contexts/demo/domain/validators/business-info.validator.ts': `
        class OtherThing { static create(_x: string): OtherThing { return new OtherThing(); } }
        interface BusinessInfo { email: string | null }
        export class BusinessInfoValidator {
          static validate(businessInfo: BusinessInfo): void {
            if (businessInfo.email != null) OtherThing.create(businessInfo.email);
          }
        }
      `,
      '/repo/apps/backend/src/contexts/demo/domain/demo-settings.vo.ts': `
        import { BusinessInfoValidator } from './validators/business-info.validator';
        export class DemoSettings {
          static create(props: unknown): DemoSettings {
            BusinessInfoValidator.validate((props as { businessInfo: { email: string | null } }).businessInfo);
            return new DemoSettings();
          }
        }
      `,
    });
    // OtherThing.create() must not satisfy the Email requirement just because both are named
    // "create" — resolution is by class identity + declaring file, not by method name alone.
    const result = checkPrimitiveFieldsValidatedAtConstruction(project, [TARGET]);
    expectScannedTargets(result, 1);
    expect(result.findings).toEqual([
      expect.objectContaining({ rule: 'vo-construction-validation' }),
    ]);
  });

  it('fails the zero-target contract when the registry references files absent from the project', () => {
    const project = fixtureProject({
      '/repo/apps/backend/src/contexts/demo/application/demo.use-case.ts': `
        export class DemoUseCase {}
      `,
    });
    expectZeroTargets(checkPrimitiveFieldsValidatedAtConstruction(project, [TARGET]));
  });
});

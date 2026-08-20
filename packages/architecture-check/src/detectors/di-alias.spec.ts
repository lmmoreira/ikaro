import {
  checkGlobalModuleExportPairing,
  checkReverseDiAlias,
  checkUnsafeUseExisting,
} from '../index';
import { expectScannedTargets, expectZeroTargets, fixtureProject } from '../testing/fixtures';

describe('checkUnsafeUseExisting', () => {
  it('rejects unsafe class aliases while allowing token aliases', () => {
    const project = fixtureProject({
      '/repo/apps/backend/src/contexts/demo/infrastructure/demo.module.ts': `
        function Module(metadata: unknown): ClassDecorator { return () => undefined; }
        class Adapter {}
        const ADAPTER = Symbol('ADAPTER');
        const EVENT_BUS = Symbol('EVENT_BUS');
        const TRIGGER_BUS = Symbol('TRIGGER_BUS');
        const unrelated = [Adapter, { provide: ADAPTER, useExisting: Adapter }];
        @Module({ providers: [Adapter, { provide: ADAPTER, useExisting: Adapter }, { provide: TRIGGER_BUS, useExisting: EVENT_BUS }] })
        class DemoModule {}
      `,
    });
    const result = checkUnsafeUseExisting(project);
    expectScannedTargets(result, 2);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toEqual(expect.objectContaining({ rule: 'unsafe-use-existing' }));
  });

  it('flags the explicit { provide: X, useClass: X } bare-equivalent form aliased via useExisting', () => {
    const project = fixtureProject({
      '/repo/apps/backend/src/contexts/demo/infrastructure/demo.module.ts': `
        function Module(metadata: unknown): ClassDecorator { return () => undefined; }
        class Adapter {}
        const ADAPTER_TOKEN = Symbol('ADAPTER_TOKEN');
        @Module({ providers: [
          { provide: Adapter, useClass: Adapter },
          { provide: ADAPTER_TOKEN, useExisting: Adapter },
        ] })
        class DemoModule {}
      `,
    });
    const result = checkUnsafeUseExisting(project);
    expectScannedTargets(result, 1);
    expect(result.findings).toEqual([
      expect.objectContaining({
        rule: 'unsafe-use-existing',
        message: expect.stringContaining('Adapter'),
      }),
    ]);
  });

  it('flags an unsafe alias even when the anchor and useExisting target use different import aliases for the same class', () => {
    const project = fixtureProject({
      '/repo/apps/backend/src/contexts/demo/infrastructure/adapter.ts': `
        export class Adapter {}
      `,
      '/repo/apps/backend/src/contexts/demo/infrastructure/demo.module.ts': `
        import { Adapter, Adapter as AdapterAlias } from './adapter';
        function Module(metadata: unknown): ClassDecorator { return () => undefined; }
        const ADAPTER_TOKEN = Symbol('ADAPTER_TOKEN');
        @Module({ providers: [Adapter, { provide: ADAPTER_TOKEN, useExisting: AdapterAlias }] })
        class DemoModule {}
      `,
    });
    const result = checkUnsafeUseExisting(project);
    expectScannedTargets(result, 1);
    expect(result.findings).toEqual([
      expect.objectContaining({
        rule: 'unsafe-use-existing',
        message: expect.stringContaining('AdapterAlias'),
      }),
    ]);
  });

  it('fails the zero-target contract when no useExisting entries exist', () => {
    const project = fixtureProject({
      '/repo/apps/backend/src/contexts/demo/infrastructure/demo.module.ts': `
        function Module(metadata: unknown): ClassDecorator { return () => undefined; }
        class Adapter {}
        @Module({ providers: [Adapter] })
        class DemoModule {}
      `,
    });
    expectZeroTargets(checkUnsafeUseExisting(project));
  });
});

describe('checkReverseDiAlias', () => {
  it('flags a class token aliased via useExisting to a functional token, while allowing token-to-token aliases', () => {
    const project = fixtureProject({
      '/repo/apps/backend/src/contexts/demo/infrastructure/demo.module.ts': `
        function Module(metadata: unknown): ClassDecorator { return () => undefined; }
        class Adapter {}
        const EVENT_BUS = Symbol('EVENT_BUS');
        const TRIGGER_BUS = Symbol('TRIGGER_BUS');
        @Module({ providers: [
          { provide: Adapter, useExisting: EVENT_BUS },
          { provide: TRIGGER_BUS, useExisting: EVENT_BUS },
        ] })
        class DemoModule {}
      `,
    });
    const result = checkReverseDiAlias(project);
    expectScannedTargets(result, 2);
    expect(result.findings).toEqual([
      expect.objectContaining({
        rule: 'reverse-di-alias',
        message: expect.stringContaining('Adapter'),
      }),
    ]);
  });

  it('does not flag a class-to-class useExisting alias — outside the documented class-to-functional-token shape', () => {
    const project = fixtureProject({
      '/repo/apps/backend/src/contexts/demo/infrastructure/demo.module.ts': `
        function Module(metadata: unknown): ClassDecorator { return () => undefined; }
        class Adapter {}
        class OtherAdapter {}
        @Module({ providers: [{ provide: Adapter, useExisting: OtherAdapter }] })
        class DemoModule {}
      `,
    });
    const result = checkReverseDiAlias(project);
    expectScannedTargets(result, 1);
    expect(result.findings).toHaveLength(0);
  });

  it('fails the zero-target contract when no useExisting entries exist', () => {
    const project = fixtureProject({
      '/repo/apps/backend/src/contexts/demo/infrastructure/demo.module.ts': `
        function Module(metadata: unknown): ClassDecorator { return () => undefined; }
        class Adapter {}
        @Module({ providers: [Adapter] })
        class DemoModule {}
      `,
    });
    expectZeroTargets(checkReverseDiAlias(project));
  });
});

describe('checkGlobalModuleExportPairing', () => {
  it('flags a token provided by a @Global() module and injected outside it, but missing from exports', () => {
    const project = fixtureProject({
      '/repo/apps/backend/src/shared/ports/demo-token.port.ts': `
        export const DEMO_TOKEN = Symbol('DEMO_TOKEN');
      `,
      '/repo/apps/backend/src/shared/infrastructure/demo.module.ts': `
        import { DEMO_TOKEN } from '../ports/demo-token.port';
        function Module(metadata: unknown): ClassDecorator { return () => undefined; }
        function Global(): ClassDecorator { return () => undefined; }
        class DemoAdapter {}
        @Global()
        @Module({ providers: [{ provide: DEMO_TOKEN, useClass: DemoAdapter }], exports: [] })
        class DemoModule {}
      `,
      '/repo/apps/backend/src/contexts/demo/infrastructure/demo.consumer.ts': `
        import { DEMO_TOKEN } from '../../../shared/ports/demo-token.port';
        function Inject(token: unknown): ParameterDecorator { return () => undefined; }
        class DemoConsumer {
          constructor(@Inject(DEMO_TOKEN) private readonly demo: unknown) {}
        }
      `,
    });
    const result = checkGlobalModuleExportPairing(project);
    expectScannedTargets(result, 1);
    expect(result.findings).toEqual([
      expect.objectContaining({
        rule: 'global-module-export-pairing',
        message: expect.stringContaining('DEMO_TOKEN'),
      }),
    ]);
  });

  it("does not flag an unexported provider consumed only inside the module's own file", () => {
    const project = fixtureProject({
      '/repo/apps/backend/src/shared/ports/demo-token.port.ts': `
        export const DEMO_TOKEN = Symbol('DEMO_TOKEN');
      `,
      '/repo/apps/backend/src/shared/infrastructure/demo.module.ts': `
        import { DEMO_TOKEN } from '../ports/demo-token.port';
        function Module(metadata: unknown): ClassDecorator { return () => undefined; }
        function Global(): ClassDecorator { return () => undefined; }
        class DemoAdapter {}
        @Global()
        @Module({ providers: [{ provide: DEMO_TOKEN, useClass: DemoAdapter }], exports: [] })
        class DemoModule {}
      `,
    });
    const result = checkGlobalModuleExportPairing(project);
    expectScannedTargets(result, 1);
    expect(result.findings).toHaveLength(0);
  });

  it('does not flag a token that is correctly exported and consumed elsewhere', () => {
    const project = fixtureProject({
      '/repo/apps/backend/src/shared/ports/demo-token.port.ts': `
        export const DEMO_TOKEN = Symbol('DEMO_TOKEN');
      `,
      '/repo/apps/backend/src/shared/infrastructure/demo.module.ts': `
        import { DEMO_TOKEN } from '../ports/demo-token.port';
        function Module(metadata: unknown): ClassDecorator { return () => undefined; }
        function Global(): ClassDecorator { return () => undefined; }
        class DemoAdapter {}
        @Global()
        @Module({ providers: [{ provide: DEMO_TOKEN, useClass: DemoAdapter }], exports: [DEMO_TOKEN] })
        class DemoModule {}
      `,
      '/repo/apps/backend/src/contexts/demo/infrastructure/demo.consumer.ts': `
        import { DEMO_TOKEN } from '../../../shared/ports/demo-token.port';
        function Inject(token: unknown): ParameterDecorator { return () => undefined; }
        class DemoConsumer {
          constructor(@Inject(DEMO_TOKEN) private readonly demo: unknown) {}
        }
      `,
    });
    const result = checkGlobalModuleExportPairing(project);
    expectScannedTargets(result, 1);
    expect(result.findings).toHaveLength(0);
  });

  it('does not flag a token referenced outside the module in a non-DI way (e.g. a plain value import)', () => {
    const project = fixtureProject({
      '/repo/apps/backend/src/shared/ports/demo-token.port.ts': `
        export const DEMO_TOKEN = Symbol('DEMO_TOKEN');
      `,
      '/repo/apps/backend/src/shared/infrastructure/demo.module.ts': `
        import { DEMO_TOKEN } from '../ports/demo-token.port';
        function Module(metadata: unknown): ClassDecorator { return () => undefined; }
        function Global(): ClassDecorator { return () => undefined; }
        class DemoAdapter {}
        @Global()
        @Module({ providers: [{ provide: DEMO_TOKEN, useClass: DemoAdapter }], exports: [] })
        class DemoModule {}
      `,
      '/repo/apps/backend/src/contexts/demo/infrastructure/demo.debug.ts': `
        import { DEMO_TOKEN } from '../../../shared/ports/demo-token.port';
        export const knownTokens = [DEMO_TOKEN];
      `,
    });
    const result = checkGlobalModuleExportPairing(project);
    expectScannedTargets(result, 1);
    expect(result.findings).toHaveLength(0);
  });

  it('does not flag a token exported via a full provider-definition object, not just a bare token', () => {
    const project = fixtureProject({
      '/repo/apps/backend/src/shared/ports/demo-token.port.ts': `
        export const DEMO_TOKEN = Symbol('DEMO_TOKEN');
      `,
      '/repo/apps/backend/src/shared/infrastructure/demo.module.ts': `
        import { DEMO_TOKEN } from '../ports/demo-token.port';
        function Module(metadata: unknown): ClassDecorator { return () => undefined; }
        function Global(): ClassDecorator { return () => undefined; }
        class DemoAdapter {}
        @Global()
        @Module({
          providers: [{ provide: DEMO_TOKEN, useClass: DemoAdapter }],
          exports: [{ provide: DEMO_TOKEN, useClass: DemoAdapter }],
        })
        class DemoModule {}
      `,
      '/repo/apps/backend/src/contexts/demo/infrastructure/demo.consumer.ts': `
        import { DEMO_TOKEN } from '../../../shared/ports/demo-token.port';
        function Inject(token: unknown): ParameterDecorator { return () => undefined; }
        class DemoConsumer {
          constructor(@Inject(DEMO_TOKEN) private readonly demo: unknown) {}
        }
      `,
    });
    const result = checkGlobalModuleExportPairing(project);
    expectScannedTargets(result, 1);
    expect(result.findings).toHaveLength(0);
  });

  it('does not flag a bare class provider referenced only as a non-constructor parameter type elsewhere', () => {
    const project = fixtureProject({
      '/repo/apps/backend/src/shared/infrastructure/demo-service.ts': `
        export class DemoService {}
      `,
      '/repo/apps/backend/src/shared/infrastructure/demo.module.ts': `
        import { DemoService } from './demo-service';
        function Module(metadata: unknown): ClassDecorator { return () => undefined; }
        function Global(): ClassDecorator { return () => undefined; }
        @Global()
        @Module({ providers: [DemoService], exports: [] })
        class DemoModule {}
      `,
      '/repo/apps/backend/src/contexts/demo/infrastructure/demo.consumer.ts': `
        import { DemoService } from '../../../shared/infrastructure/demo-service';
        class DemoConsumer {
          someMethod(service: DemoService) {}
        }
      `,
    });
    const result = checkGlobalModuleExportPairing(project);
    expectScannedTargets(result, 1);
    expect(result.findings).toHaveLength(0);
  });

  it('flags a token injected via an aliased Inject import (e.g. import { Inject as DiInject })', () => {
    const project = fixtureProject({
      '/repo/apps/backend/src/shared/ports/demo-token.port.ts': `
        export const DEMO_TOKEN = Symbol('DEMO_TOKEN');
      `,
      '/repo/apps/backend/src/shared/infrastructure/demo.module.ts': `
        import { DEMO_TOKEN } from '../ports/demo-token.port';
        function Module(metadata: unknown): ClassDecorator { return () => undefined; }
        function Global(): ClassDecorator { return () => undefined; }
        class DemoAdapter {}
        @Global()
        @Module({ providers: [{ provide: DEMO_TOKEN, useClass: DemoAdapter }], exports: [] })
        class DemoModule {}
      `,
      '/repo/apps/backend/src/nestjs-common-shim.ts': `
        export function Inject(token: unknown): ParameterDecorator { return () => undefined; }
      `,
      '/repo/apps/backend/src/contexts/demo/infrastructure/demo.consumer.ts': `
        import { DEMO_TOKEN } from '../../../shared/ports/demo-token.port';
        import { Inject as DiInject } from '../../../nestjs-common-shim';
        class DemoConsumer {
          constructor(@DiInject(DEMO_TOKEN) private readonly demo: unknown) {}
        }
      `,
    });
    const result = checkGlobalModuleExportPairing(project);
    expectScannedTargets(result, 1);
    expect(result.findings).toEqual([
      expect.objectContaining({
        rule: 'global-module-export-pairing',
        message: expect.stringContaining('DEMO_TOKEN'),
      }),
    ]);
  });

  it('does not flag a bare class provider whose type only appears on a constructor parameter injected by a different explicit token', () => {
    const project = fixtureProject({
      '/repo/apps/backend/src/shared/infrastructure/demo-service.ts': `
        export class DemoService {}
      `,
      '/repo/apps/backend/src/shared/infrastructure/demo.module.ts': `
        import { DemoService } from './demo-service';
        function Module(metadata: unknown): ClassDecorator { return () => undefined; }
        function Global(): ClassDecorator { return () => undefined; }
        @Global()
        @Module({ providers: [DemoService], exports: [] })
        class DemoModule {}
      `,
      '/repo/apps/backend/src/shared/ports/other-token.port.ts': `
        export const OTHER_TOKEN = Symbol('OTHER_TOKEN');
      `,
      '/repo/apps/backend/src/contexts/demo/infrastructure/demo.consumer.ts': `
        import { DemoService } from '../../../shared/infrastructure/demo-service';
        import { OTHER_TOKEN } from '../../../shared/ports/other-token.port';
        function Inject(token: unknown): ParameterDecorator { return () => undefined; }
        class DemoConsumer {
          constructor(@Inject(OTHER_TOKEN) private readonly demo: DemoService) {}
        }
      `,
    });
    const result = checkGlobalModuleExportPairing(project);
    expectScannedTargets(result, 1);
    expect(result.findings).toHaveLength(0);
  });

  it('fails the zero-target contract when no @Global() module exists', () => {
    const project = fixtureProject({
      '/repo/apps/backend/src/shared/infrastructure/demo.module.ts': `
        function Module(metadata: unknown): ClassDecorator { return () => undefined; }
        class Adapter {}
        @Module({ providers: [Adapter], exports: [Adapter] })
        class DemoModule {}
      `,
    });
    expectZeroTargets(checkGlobalModuleExportPairing(project));
  });
});

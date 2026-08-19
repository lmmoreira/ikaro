import {
  checkEntityBuilderPrimaryKeyDefaults,
  checkTestBuilderCoverage,
  checkTestDataHarnessRegistrations,
} from '../index';
import { expectScannedTargets, expectZeroTargets, fixtureProject } from '../testing/fixtures';

describe('checkTestBuilderCoverage', () => {
  it('accepts a TypeORM entity that has a matching XxxEntityBuilder', () => {
    const project = fixtureProject({
      '/repo/apps/backend/src/contexts/demo/infrastructure/entities/demo.entity.ts': `
        function Entity(name?: string, options?: unknown): ClassDecorator { return () => undefined; }
        @Entity('demos')
        export class DemoEntity {}
      `,
      '/repo/apps/backend/src/test/builders/demo/demo-entity.builder.ts': `
        export class DemoEntityBuilder {}
      `,
    });
    const result = checkTestBuilderCoverage(project);
    expectScannedTargets(result, 1);
    expect(result.findings).toHaveLength(0);
  });

  it('reports a TypeORM entity with no matching builder, naming the expected class and directory', () => {
    const project = fixtureProject({
      '/repo/apps/backend/src/contexts/demo/infrastructure/entities/demo.entity.ts': `
        function Entity(name?: string, options?: unknown): ClassDecorator { return () => undefined; }
        @Entity('demos')
        export class DemoEntity {}
      `,
    });
    const result = checkTestBuilderCoverage(project);
    expectScannedTargets(result, 1);
    expect(result.findings).toEqual([
      expect.objectContaining({
        rule: 'test-builder-coverage',
        message: expect.stringContaining('DemoEntityBuilder'),
      }),
    ]);
  });

  it('resolves a shared entity (outside contexts/**) to the "shared" builder directory', () => {
    const project = fixtureProject({
      '/repo/apps/backend/src/shared/infrastructure/outbox/outbox-event.entity.ts': `
        function Entity(name?: string, options?: unknown): ClassDecorator { return () => undefined; }
        @Entity('outbox')
        export class OutboxEventEntity {}
      `,
    });
    const result = checkTestBuilderCoverage(project);
    expectScannedTargets(result, 1);
    expect(result.findings).toEqual([
      expect.objectContaining({
        message: expect.stringContaining('src/test/builders/shared/'),
      }),
    ]);
  });

  it('does not require a builder for an event constructed inline in fewer than 2 spec files', () => {
    const project = fixtureProject({
      '/repo/apps/backend/src/shared/domain/domain-event.ts': `
        export abstract class DomainEvent {}
      `,
      '/repo/apps/backend/src/contexts/demo/domain/events/demo-happened.event.ts': `
        import { DomainEvent } from '../../../../shared/domain/domain-event';
        export class DemoHappened extends DomainEvent {}
      `,
      '/repo/apps/backend/src/contexts/demo/application/one.use-case.spec.ts': `
        import { DemoHappened } from '../../domain/events/demo-happened.event';
        const event = new DemoHappened();
      `,
    });
    const result = checkTestBuilderCoverage(project);
    // Only 1 spec file constructs it inline — below the 2-file threshold, so it's not a
    // required target yet and contributes nothing to scannedTargets.
    expectZeroTargets(result);
  });

  it('requires a builder for an event constructed inline in 2+ spec files', () => {
    const project = fixtureProject({
      '/repo/apps/backend/src/shared/domain/domain-event.ts': `
        export abstract class DomainEvent {}
      `,
      '/repo/apps/backend/src/contexts/demo/domain/events/demo-happened.event.ts': `
        import { DomainEvent } from '../../../../shared/domain/domain-event';
        export class DemoHappened extends DomainEvent {}
      `,
      '/repo/apps/backend/src/contexts/demo/application/one.use-case.spec.ts': `
        import { DemoHappened } from '../../domain/events/demo-happened.event';
        const event = new DemoHappened();
      `,
      '/repo/apps/backend/src/contexts/demo/application/two.use-case.spec.ts': `
        import { DemoHappened } from '../../domain/events/demo-happened.event';
        const event = new DemoHappened();
      `,
    });
    const result = checkTestBuilderCoverage(project);
    expectScannedTargets(result, 1);
    expect(result.findings).toEqual([
      expect.objectContaining({
        rule: 'test-builder-coverage',
        message: expect.stringContaining('DemoHappenedEventBuilder'),
      }),
    ]);
  });

  it('accepts a Command constructed inline in 2+ spec files once its CommandBuilder exists', () => {
    const project = fixtureProject({
      '/repo/apps/backend/src/shared/domain/command.ts': `
        export abstract class Command {}
      `,
      '/repo/apps/backend/src/contexts/demo/domain/commands/demo-due.command.ts': `
        import { Command } from '../../../../shared/domain/command';
        export class DemoDue extends Command {}
      `,
      '/repo/apps/backend/src/contexts/demo/application/one.use-case.spec.ts': `
        import { DemoDue } from '../../domain/commands/demo-due.command';
        const c = new DemoDue();
      `,
      '/repo/apps/backend/src/contexts/demo/application/two.use-case.spec.ts': `
        import { DemoDue } from '../../domain/commands/demo-due.command';
        const c = new DemoDue();
      `,
      '/repo/apps/backend/src/test/builders/demo/demo-due-command.builder.ts': `
        export class DemoDueCommandBuilder {}
      `,
    });
    const result = checkTestBuilderCoverage(project);
    expectScannedTargets(result, 1);
    expect(result.findings).toHaveLength(0);
  });
});

describe('checkEntityBuilderPrimaryKeyDefaults', () => {
  it('accepts a uuid primary key whose builder field initializer defaults to uuidv7()', () => {
    const project = fixtureProject({
      '/repo/apps/backend/src/contexts/demo/infrastructure/entities/demo.entity.ts': `
        function Entity(name?: string, options?: unknown): ClassDecorator { return () => undefined; }
        function PrimaryColumn(options?: unknown): PropertyDecorator { return () => undefined; }
        @Entity('demos')
        export class DemoEntity {
          @PrimaryColumn({ type: 'uuid' })
          id!: string;
        }
      `,
      '/repo/apps/backend/src/test/builders/demo/demo-entity.builder.ts': `
        function uuidv7(): string { return 'stub'; }
        export class DemoEntityBuilder {
          private id = uuidv7();
        }
      `,
    });
    const result = checkEntityBuilderPrimaryKeyDefaults(project);
    expectScannedTargets(result, 1);
    expect(result.findings).toHaveLength(0);
  });

  it('reports a uuid primary key whose builder field defaults to a plain literal instead of uuidv7()', () => {
    const project = fixtureProject({
      '/repo/apps/backend/src/contexts/demo/infrastructure/entities/demo.entity.ts': `
        function Entity(name?: string, options?: unknown): ClassDecorator { return () => undefined; }
        function PrimaryColumn(options?: unknown): PropertyDecorator { return () => undefined; }
        @Entity('demos')
        export class DemoEntity {
          @PrimaryColumn({ type: 'uuid' })
          id!: string;
        }
      `,
      '/repo/apps/backend/src/test/builders/demo/demo-entity.builder.ts': `
        export class DemoEntityBuilder {
          private id = 'demo-id-1';
        }
      `,
    });
    const result = checkEntityBuilderPrimaryKeyDefaults(project);
    expectScannedTargets(result, 1);
    expect(result.findings).toEqual([
      expect.objectContaining({
        rule: 'entity-builder-pk-uuidv7-default',
        message: expect.stringContaining('DemoEntity.id'),
      }),
    ]);
  });

  it('accepts a non-"id" primary key name (e.g. lineId) defaulting to uuidv7()', () => {
    const project = fixtureProject({
      '/repo/apps/backend/src/contexts/demo/infrastructure/entities/demo-line.entity.ts': `
        function Entity(name?: string, options?: unknown): ClassDecorator { return () => undefined; }
        function PrimaryColumn(options?: unknown): PropertyDecorator { return () => undefined; }
        @Entity('demo_lines')
        export class DemoLineEntity {
          @PrimaryColumn({ name: 'line_id', type: 'uuid' })
          lineId!: string;
        }
      `,
      '/repo/apps/backend/src/test/builders/demo/demo-line-entity.builder.ts': `
        function uuidv7(): string { return 'stub'; }
        export class DemoLineEntityBuilder {
          private lineId = uuidv7();
        }
      `,
    });
    const result = checkEntityBuilderPrimaryKeyDefaults(project);
    expectScannedTargets(result, 1);
    expect(result.findings).toHaveLength(0);
  });

  it('never requires uuidv7() for a tenantId column, even as part of a composite primary key', () => {
    const project = fixtureProject({
      '/repo/apps/backend/src/contexts/demo/infrastructure/entities/demo-balance.entity.ts': `
        function Entity(name?: string, options?: unknown): ClassDecorator { return () => undefined; }
        function PrimaryColumn(options?: unknown): PropertyDecorator { return () => undefined; }
        @Entity('demo_balances')
        export class DemoBalanceEntity {
          @PrimaryColumn({ name: 'tenant_id', type: 'uuid' })
          tenantId!: string;

          @PrimaryColumn({ name: 'customer_id', type: 'uuid' })
          customerId!: string;
        }
      `,
      '/repo/apps/backend/src/test/builders/demo/demo-balance-entity.builder.ts': `
        function uuidv7(): string { return 'stub'; }
        export class DemoBalanceEntityBuilder {
          private tenantId = '00000000-0000-7000-8000-000000000001';
          private customerId = uuidv7();
        }
      `,
    });
    const result = checkEntityBuilderPrimaryKeyDefaults(project);
    // Only customerId is a scanned target — tenantId is always exempt.
    expectScannedTargets(result, 1);
    expect(result.findings).toHaveLength(0);
  });

  it('never requires uuidv7() for a non-uuid-typed primary key', () => {
    const project = fixtureProject({
      '/repo/apps/backend/src/contexts/demo/infrastructure/entities/demo-provider-balance.entity.ts': `
        function Entity(name?: string, options?: unknown): ClassDecorator { return () => undefined; }
        function PrimaryColumn(options?: unknown): PropertyDecorator { return () => undefined; }
        @Entity('demo_provider_balance')
        export class DemoProviderBalanceEntity {
          @PrimaryColumn({ type: 'varchar', length: 32 })
          provider!: string;
        }
      `,
      '/repo/apps/backend/src/test/builders/demo/demo-provider-balance-entity.builder.ts': `
        export class DemoProviderBalanceEntityBuilder {
          private provider = 'openrouter';
        }
      `,
    });
    const result = checkEntityBuilderPrimaryKeyDefaults(project);
    expectZeroTargets(result);
  });

  it('accepts a constructor-assigned uuidv7() default, not just a field initializer', () => {
    const project = fixtureProject({
      '/repo/apps/backend/src/contexts/demo/infrastructure/entities/demo.entity.ts': `
        function Entity(name?: string, options?: unknown): ClassDecorator { return () => undefined; }
        function PrimaryColumn(options?: unknown): PropertyDecorator { return () => undefined; }
        @Entity('demos')
        export class DemoEntity {
          @PrimaryColumn({ type: 'uuid' })
          id!: string;
        }
      `,
      '/repo/apps/backend/src/test/builders/demo/demo-entity.builder.ts': `
        function uuidv7(): string { return 'stub'; }
        export class DemoEntityBuilder {
          private id: string;
          constructor() {
            this.id = uuidv7();
          }
        }
      `,
    });
    const result = checkEntityBuilderPrimaryKeyDefaults(project);
    expectScannedTargets(result, 1);
    expect(result.findings).toHaveLength(0);
  });

  it('skips an entity with no matching builder — that gap is test-builder-coverage’s finding, not this rule’s', () => {
    const project = fixtureProject({
      '/repo/apps/backend/src/contexts/demo/infrastructure/entities/demo.entity.ts': `
        function Entity(name?: string, options?: unknown): ClassDecorator { return () => undefined; }
        function PrimaryColumn(options?: unknown): PropertyDecorator { return () => undefined; }
        @Entity('demos')
        export class DemoEntity {
          @PrimaryColumn({ type: 'uuid' })
          id!: string;
        }
      `,
    });
    const result = checkEntityBuilderPrimaryKeyDefaults(project);
    expectZeroTargets(result);
  });

  it('treats a no-arg PrimaryGeneratedColumn as uuid-shaped and an explicit increment strategy as not', () => {
    const project = fixtureProject({
      '/repo/apps/backend/src/contexts/demo/infrastructure/entities/demo.entity.ts': `
        function Entity(name?: string, options?: unknown): ClassDecorator { return () => undefined; }
        function PrimaryGeneratedColumn(strategy?: string): PropertyDecorator { return () => undefined; }
        @Entity('demos')
        export class DemoEntity {
          @PrimaryGeneratedColumn()
          id!: string;
        }
      `,
      '/repo/apps/backend/src/contexts/demo/infrastructure/entities/demo-counter.entity.ts': `
        function Entity(name?: string, options?: unknown): ClassDecorator { return () => undefined; }
        function PrimaryGeneratedColumn(strategy?: string): PropertyDecorator { return () => undefined; }
        @Entity('demo_counters')
        export class DemoCounterEntity {
          @PrimaryGeneratedColumn('increment')
          id!: number;
        }
      `,
      '/repo/apps/backend/src/test/builders/demo/demo-entity.builder.ts': `
        function uuidv7(): string { return 'stub'; }
        export class DemoEntityBuilder {
          private id = uuidv7();
        }
      `,
      '/repo/apps/backend/src/test/builders/demo/demo-counter-entity.builder.ts': `
        export class DemoCounterEntityBuilder {
          private id = 1;
        }
      `,
    });
    const result = checkEntityBuilderPrimaryKeyDefaults(project);
    // Only DemoEntity.id (no-arg PrimaryGeneratedColumn) is in scope; DemoCounterEntity.id
    // (explicit 'increment' strategy) is correctly excluded.
    expectScannedTargets(result, 1);
    expect(result.findings).toHaveLength(0);
  });
});

describe('checkTestDataHarnessRegistrations', () => {
  const entityFiles = {
    '/repo/apps/backend/src/contexts/demo/infrastructure/entities/demo-a.entity.ts': `
      function Entity(name?: string, options?: unknown): ClassDecorator { return () => undefined; }
      @Entity('demo_a')
      export class DemoAEntity {}
    `,
    '/repo/apps/backend/src/contexts/demo/infrastructure/entities/demo-b.entity.ts': `
      function Entity(name?: string, options?: unknown): ClassDecorator { return () => undefined; }
      @Entity('demo_b')
      export class DemoBEntity {}
    `,
  };

  it('accepts a "complete" harness whose entities array carries every resolved production entity', () => {
    const project = fixtureProject({
      ...entityFiles,
      '/repo/apps/backend/src/test/integration-global-setup.ts': `
        import { DemoAEntity } from '../contexts/demo/infrastructure/entities/demo-a.entity';
        import { DemoBEntity } from '../contexts/demo/infrastructure/entities/demo-b.entity';
        const ds = { entities: [DemoAEntity, DemoBEntity] };
      `,
    });
    const result = checkTestDataHarnessRegistrations(project, [
      { file: 'apps/backend/src/test/integration-global-setup.ts', completeness: 'complete' },
    ]);
    expectScannedTargets(result, 1);
    expect(result.findings).toHaveLength(0);
  });

  it('reports a "complete" harness missing a resolved production entity', () => {
    const project = fixtureProject({
      ...entityFiles,
      '/repo/apps/backend/src/test/integration-global-setup.ts': `
        import { DemoAEntity } from '../contexts/demo/infrastructure/entities/demo-a.entity';
        const ds = { entities: [DemoAEntity] };
      `,
    });
    const result = checkTestDataHarnessRegistrations(project, [
      { file: 'apps/backend/src/test/integration-global-setup.ts', completeness: 'complete' },
    ]);
    expectScannedTargets(result, 1);
    expect(result.findings).toEqual([
      expect.objectContaining({
        rule: 'test-harness-registration',
        message: expect.stringContaining('missing DemoBEntity'),
      }),
    ]);
  });

  it('compares a "partial" harness against its declared subset, not the full production set', () => {
    const project = fixtureProject({
      ...entityFiles,
      '/repo/apps/backend/src/test/test-datasource.ts': `
        import { DemoAEntity } from '../contexts/demo/infrastructure/entities/demo-a.entity';
        const ds = { entities: [DemoAEntity] };
      `,
    });
    const result = checkTestDataHarnessRegistrations(project, [
      {
        file: 'apps/backend/src/test/test-datasource.ts',
        completeness: 'partial',
        entities: ['DemoAEntity'],
      },
    ]);
    expectScannedTargets(result, 1);
    expect(result.findings).toHaveLength(0);
  });

  it('reports drift between a "partial" harness’s actual array and its declared policy entry, in either direction', () => {
    const project = fixtureProject({
      ...entityFiles,
      '/repo/apps/backend/src/test/test-datasource.ts': `
        import { DemoAEntity } from '../contexts/demo/infrastructure/entities/demo-a.entity';
        import { DemoBEntity } from '../contexts/demo/infrastructure/entities/demo-b.entity';
        const ds = { entities: [DemoAEntity, DemoBEntity] };
      `,
    });
    const result = checkTestDataHarnessRegistrations(project, [
      {
        file: 'apps/backend/src/test/test-datasource.ts',
        completeness: 'partial',
        entities: ['DemoAEntity'],
      },
    ]);
    expectScannedTargets(result, 1);
    expect(result.findings).toEqual([
      expect.objectContaining({
        message: expect.stringContaining('unexpected DemoBEntity'),
      }),
    ]);
  });

  it('does not treat a runtime ...spread element as missing/extra drift', () => {
    const project = fixtureProject({
      ...entityFiles,
      '/repo/apps/backend/src/test/utils/notification-integration-app.ts': `
        import { DemoAEntity } from '../../contexts/demo/infrastructure/entities/demo-a.entity';
        function build(extraEntities: unknown[]) {
          return { entities: [DemoAEntity, ...extraEntities] };
        }
      `,
    });
    const result = checkTestDataHarnessRegistrations(project, [
      {
        file: 'apps/backend/src/test/utils/notification-integration-app.ts',
        completeness: 'partial',
        entities: ['DemoAEntity'],
      },
    ]);
    expectScannedTargets(result, 1);
    expect(result.findings).toHaveLength(0);
  });

  it('reports a registration whose file does not resolve in the project', () => {
    const project = fixtureProject(entityFiles);
    const result = checkTestDataHarnessRegistrations(project, [
      { file: 'apps/backend/src/test/does-not-exist.ts', completeness: 'complete' },
    ]);
    expectScannedTargets(result, 1);
    expect(result.findings).toEqual([
      expect.objectContaining({
        message: expect.stringContaining('no such file was resolved'),
      }),
    ]);
  });

  it('checks the migrations array too when requiresMigrations is set', () => {
    const project = fixtureProject({
      '/repo/apps/backend/src/contexts/demo/infrastructure/migrations/1-create-demo.ts': `
        export class CreateDemo1 implements MigrationInterface {}
      `,
      '/repo/apps/backend/src/test/integration-global-setup.ts': `
        import { CreateDemo1 } from '../contexts/demo/infrastructure/migrations/1-create-demo';
        const ds = { entities: [], migrations: [] };
      `,
    });
    const result = checkTestDataHarnessRegistrations(project, [
      {
        file: 'apps/backend/src/test/integration-global-setup.ts',
        completeness: 'complete',
        requiresMigrations: true,
      },
    ]);
    // 1 entities-array check (empty vs empty — no production entities in this fixture) + 1
    // migrations-array check, which reports the missing CreateDemo1.
    expectScannedTargets(result, 2);
    expect(result.findings).toEqual([
      expect.objectContaining({
        message: expect.stringContaining('missing CreateDemo1'),
      }),
    ]);
  });
});

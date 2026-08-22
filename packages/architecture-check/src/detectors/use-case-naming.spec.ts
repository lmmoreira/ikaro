import { checkUseCaseInputNaming, checkUseCaseResultNaming } from '../index';
import { expectScannedTargets, expectZeroTargets, fixtureProject } from '../testing/fixtures';

const FILE = 'apps/backend/src/contexts/demo/application/use-cases/get-demo.use-case.ts';

describe('checkUseCaseResultNaming', () => {
  it('passes when the result type matches {ClassName}Result', () => {
    const project = fixtureProject({
      [FILE]: `
        export interface GetDemoUseCaseResult { id: string }
        export class GetDemoUseCase {
          async execute(): Promise<GetDemoUseCaseResult> { return { id: '1' }; }
        }
      `,
    });
    const result = checkUseCaseResultNaming(project);
    expectScannedTargets(result, 1);
    expect(result.findings).toHaveLength(0);
  });

  it('passes for a void-returning execute()', () => {
    const project = fixtureProject({
      [FILE]: `
        export class RemoveDemoUseCase {
          async execute(): Promise<void> { return; }
        }
      `,
    });
    const result = checkUseCaseResultNaming(project);
    expectScannedTargets(result, 1);
    expect(result.findings).toHaveLength(0);
  });

  it('passes when a Result-named type is returned as a list', () => {
    const project = fixtureProject({
      [FILE]: `
        export interface GetDemoUseCaseResult { id: string }
        export class GetDemoUseCase {
          async execute(): Promise<GetDemoUseCaseResult[]> { return []; }
        }
      `,
    });
    const result = checkUseCaseResultNaming(project);
    expectScannedTargets(result, 1);
    expect(result.findings).toHaveLength(0);
  });

  it('flags a *Info-suffixed result type', () => {
    const project = fixtureProject({
      [FILE]: `
        export interface GetDemoInfo { id: string }
        export class GetDemoUseCase {
          async execute(): Promise<GetDemoInfo> { return { id: '1' }; }
        }
      `,
    });
    const result = checkUseCaseResultNaming(project);
    expectScannedTargets(result, 1);
    expect(result.findings).toEqual([
      expect.objectContaining({
        rule: 'use-case-result-naming',
        message: expect.stringContaining('GetDemoInfo'),
      }),
    ]);
  });

  it('flags a raw array of an unrelated, unnamed-for-this-purpose entity type', () => {
    const project = fixtureProject({
      [FILE]: `
        export interface DemoEntity { id: string }
        export class GetDemoUseCase {
          async execute(): Promise<DemoEntity[]> { return []; }
        }
      `,
    });
    const result = checkUseCaseResultNaming(project);
    expectScannedTargets(result, 1);
    expect(result.findings).toEqual([
      expect.objectContaining({
        rule: 'use-case-result-naming',
        message: expect.stringContaining('DemoEntity'),
      }),
    ]);
  });

  it('flags a raw primitive array return type', () => {
    const project = fixtureProject({
      [FILE]: `
        export class GetDemoUseCase {
          async execute(): Promise<string[]> { return []; }
        }
      `,
    });
    const result = checkUseCaseResultNaming(project);
    expectScannedTargets(result, 1);
    expect(result.findings).toEqual([
      expect.objectContaining({
        rule: 'use-case-result-naming',
        message: expect.stringContaining('string'),
      }),
    ]);
  });

  it('flags a raw primitive Array<T> return type', () => {
    const project = fixtureProject({
      [FILE]: `
        export class GetDemoUseCase {
          async execute(): Promise<Array<string>> { return []; }
        }
      `,
    });
    const result = checkUseCaseResultNaming(project);
    expectScannedTargets(result, 1);
    expect(result.findings).toEqual([
      expect.objectContaining({
        rule: 'use-case-result-naming',
        message: expect.stringContaining('string'),
      }),
    ]);
  });

  it('flags a bare primitive return type', () => {
    const project = fixtureProject({
      [FILE]: `
        export class GetDemoUseCase {
          async execute(): Promise<number> { return 1; }
        }
      `,
    });
    const result = checkUseCaseResultNaming(project);
    expectScannedTargets(result, 1);
    expect(result.findings).toEqual([
      expect.objectContaining({
        rule: 'use-case-result-naming',
        message: expect.stringContaining('number'),
      }),
    ]);
  });

  it('flags an inline/anonymous return shape', () => {
    const project = fixtureProject({
      [FILE]: `
        export class GetDemoUseCase {
          async execute(): Promise<{ id: string }> { return { id: '1' }; }
        }
      `,
    });
    const result = checkUseCaseResultNaming(project);
    expectScannedTargets(result, 1);
    expect(result.findings).toEqual([
      expect.objectContaining({
        rule: 'use-case-result-naming',
        message: expect.stringContaining('inline/anonymous'),
      }),
    ]);
  });

  it('does not scan an abstract base class sharing one Result across concrete subclasses', () => {
    const project = fixtureProject({
      [FILE.replace('get-demo', 'base-demo-notification')]: `
        export interface DemoNotificationUseCaseResult { sent: boolean }
        export abstract class BaseDemoNotificationUseCase {
          async execute(): Promise<DemoNotificationUseCaseResult> { return { sent: true }; }
        }
      `,
    });
    expectZeroTargets(checkUseCaseResultNaming(project));
  });
});

describe('checkUseCaseInputNaming', () => {
  it('passes when execute() takes a dedicated UseCaseInput type', () => {
    const project = fixtureProject({
      [FILE]: `
        export interface GetDemoUseCaseInput { id: string }
        export class GetDemoUseCase {
          async execute(input: GetDemoUseCaseInput): Promise<void> { return; }
        }
      `,
    });
    const result = checkUseCaseInputNaming(project);
    expectScannedTargets(result, 1);
    expect(result.findings).toHaveLength(0);
  });

  it('passes for a no-arg execute()', () => {
    const project = fixtureProject({
      [FILE]: `
        export class GetDemoUseCase {
          async execute(): Promise<void> { return; }
        }
      `,
    });
    const result = checkUseCaseInputNaming(project);
    expectScannedTargets(result, 1);
    expect(result.findings).toHaveLength(0);
  });

  it('passes for a primitive param', () => {
    const project = fixtureProject({
      [FILE]: `
        export class GetDemoUseCase {
          async execute(id: string): Promise<void> { return; }
        }
      `,
    });
    const result = checkUseCaseInputNaming(project);
    expectScannedTargets(result, 1);
    expect(result.findings).toHaveLength(0);
  });

  it('flags an inline anonymous object type written directly in the execute() signature', () => {
    const project = fixtureProject({
      [FILE]: `
        export class GetDemoUseCase {
          async execute(input: { id: string }): Promise<void> { return; }
        }
      `,
    });
    const result = checkUseCaseInputNaming(project);
    expectScannedTargets(result, 1);
    expect(result.findings).toEqual([
      expect.objectContaining({
        rule: 'use-case-input-naming',
        message: expect.stringContaining('inline/anonymous'),
      }),
    ]);
  });

  it('flags an inline intersection type written directly in the execute() signature', () => {
    const project = fixtureProject({
      [FILE]: `
        export interface GetDemoDto { id: string }
        export class GetDemoUseCase {
          async execute(input: GetDemoDto & { tenantId: string }): Promise<void> { return; }
        }
      `,
    });
    const result = checkUseCaseInputNaming(project);
    expectScannedTargets(result, 1);
    expect(result.findings).toEqual([
      expect.objectContaining({
        rule: 'use-case-input-naming',
        message: expect.stringContaining('inline/anonymous'),
      }),
    ]);
  });

  it('flags execute() taking an HTTP Dto type directly', () => {
    const project = fixtureProject({
      [FILE]: `
        export interface GetDemoDto { id: string }
        export class GetDemoUseCase {
          async execute(dto: GetDemoDto): Promise<void> { return; }
        }
      `,
    });
    const result = checkUseCaseInputNaming(project);
    expectScannedTargets(result, 1);
    expect(result.findings).toEqual([
      expect.objectContaining({
        rule: 'use-case-input-naming',
        message: expect.stringContaining('GetDemoDto'),
      }),
    ]);
  });

  it('flags a destructured param typed as a Dto', () => {
    const project = fixtureProject({
      [FILE]: `
        export interface GetDemoDto { id: string }
        export class GetDemoUseCase {
          async execute({ id }: GetDemoDto): Promise<void> { return; }
        }
      `,
    });
    const result = checkUseCaseInputNaming(project);
    expectScannedTargets(result, 1);
    expect(result.findings).toEqual([expect.objectContaining({ rule: 'use-case-input-naming' })]);
  });

  it('does not scan an abstract base class', () => {
    const project = fixtureProject({
      [FILE.replace('get-demo', 'base-demo-notification')]: `
        export interface DemoDto { id: string }
        export abstract class BaseDemoNotificationUseCase {
          async execute(dto: DemoDto): Promise<void> { return; }
        }
      `,
    });
    expectZeroTargets(checkUseCaseInputNaming(project));
  });

  it('flags a bare type alias that re-exports an HTTP Dto without adding anything', () => {
    const project = fixtureProject({
      [FILE]: `
        export interface GetDemoDto { id: string }
        export type GetDemoUseCaseInput = GetDemoDto;
        export class GetDemoUseCase {
          async execute(input: GetDemoUseCaseInput): Promise<void> { return; }
        }
      `,
    });
    const result = checkUseCaseInputNaming(project);
    expectScannedTargets(result, 1);
    expect(result.findings).toEqual([
      expect.objectContaining({
        rule: 'use-case-input-naming',
        message: expect.stringContaining('GetDemoDto'),
      }),
    ]);
  });

  it('flags a Dto reached through a 3-hop chain of bare aliases', () => {
    // Regression fixture (PR #399 review, Codex): the off-by-one used `depth < MAX_ALIAS_DEPTH`,
    // which resolved this chain's final hop to GetDemoDto but exited before checking its name.
    const project = fixtureProject({
      [FILE]: `
        export interface GetDemoDto { id: string }
        export type TransportShape = GetDemoDto;
        export type AppShape = TransportShape;
        export type GetDemoUseCaseInput = AppShape;
        export class GetDemoUseCase {
          async execute(input: GetDemoUseCaseInput): Promise<void> { return; }
        }
      `,
    });
    const result = checkUseCaseInputNaming(project);
    expectScannedTargets(result, 1);
    expect(result.findings).toEqual([
      expect.objectContaining({
        rule: 'use-case-input-naming',
        message: expect.stringContaining('GetDemoDto'),
      }),
    ]);
  });

  it('passes when the Input type extends the Dto via a real interface declaration', () => {
    const project = fixtureProject({
      [FILE]: `
        export interface GetDemoDto { id: string }
        export interface GetDemoUseCaseInput extends GetDemoDto {}
        export class GetDemoUseCase {
          async execute(input: GetDemoUseCaseInput): Promise<void> { return; }
        }
      `,
    });
    const result = checkUseCaseInputNaming(project);
    expectScannedTargets(result, 1);
    expect(result.findings).toHaveLength(0);
  });

  it('passes when the Input type intersects the Dto with extra context-derived fields', () => {
    const project = fixtureProject({
      [FILE]: `
        export interface GetDemoDto { id: string }
        export type GetDemoUseCaseInput = GetDemoDto & { tenantId: string };
        export class GetDemoUseCase {
          async execute(input: GetDemoUseCaseInput): Promise<void> { return; }
        }
      `,
    });
    const result = checkUseCaseInputNaming(project);
    expectScannedTargets(result, 1);
    expect(result.findings).toHaveLength(0);
  });

  it('flags an independently-declared Input type missing the exact {ClassName}Input name', () => {
    const project = fixtureProject({
      [FILE]: `
        export interface GetDemoDto { id: string }
        export type GetDemoInput = GetDemoDto & { tenantId: string };
        export class GetDemoUseCase {
          async execute(input: GetDemoInput): Promise<void> { return; }
        }
      `,
    });
    const result = checkUseCaseInputNaming(project);
    expectScannedTargets(result, 1);
    expect(result.findings).toEqual([
      expect.objectContaining({
        rule: 'use-case-input-naming',
        message: expect.stringContaining('GetDemoUseCaseInput'),
      }),
    ]);
  });
});

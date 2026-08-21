import { checkBffTypesLiveInModuleFiles } from '../index';
import { expectScannedTargets, expectZeroTargets, fixtureProject } from '../testing/fixtures';

const CONTROLLER_FILE = 'apps/bff/src/features/demo/demo.controller.ts';

describe('checkBffTypesLiveInModuleFiles', () => {
  it('passes when the controller only imports/re-exports types, declaring none itself', () => {
    const project = fixtureProject({
      'apps/bff/src/features/demo/demo.types.ts': `
        export interface DemoResponse { id: string }
      `,
      'apps/bff/src/features/demo/demo.schemas.ts': `
        import { z } from 'zod';
        export const CreateDemoBodySchema = z.object({ name: z.string() });
        export type CreateDemoBody = z.infer<typeof CreateDemoBodySchema>;
      `,
      [CONTROLLER_FILE]: `
        import { DemoResponse } from './demo.types';
        import { CreateDemoBody, CreateDemoBodySchema } from './demo.schemas';
        export * from './demo.schemas';
        export class DemoController {
          create(dto: CreateDemoBody): DemoResponse { return { id: '1' }; }
        }
      `,
    });
    const result = checkBffTypesLiveInModuleFiles(project);
    expectScannedTargets(result, 1);
    expect(result.findings).toHaveLength(0);
  });

  it('flags a response interface declared inline in the controller', () => {
    const project = fixtureProject({
      [CONTROLLER_FILE]: `
        export interface DemoResponse { id: string }
        export class DemoController {
          get(): DemoResponse { return { id: '1' }; }
        }
      `,
    });
    const result = checkBffTypesLiveInModuleFiles(project);
    expectScannedTargets(result, 1);
    expect(result.findings).toEqual([
      expect.objectContaining({
        rule: 'bff-controller-inline-type',
        message: expect.stringContaining('DemoResponse'),
      }),
    ]);
  });

  it('flags both the inline Zod schema const and its inferred Body type alias', () => {
    const project = fixtureProject({
      [CONTROLLER_FILE]: `
        import { z } from 'zod';
        const CreateDemoBodySchema = z.object({ name: z.string() });
        type CreateDemoBody = z.infer<typeof CreateDemoBodySchema>;
        export class DemoController {
          create(dto: CreateDemoBody): void {}
        }
      `,
    });
    const result = checkBffTypesLiveInModuleFiles(project);
    expectScannedTargets(result, 1);
    const names = result.findings.map((f) => f.message);
    expect(result.findings).toHaveLength(2);
    expect(names.some((m) => m.includes('CreateDemoBodySchema'))).toBe(true);
    expect(names.some((m) => m.includes('CreateDemoBody'))).toBe(true);
  });

  it('flags a standalone inline Zod schema const with no paired named type', () => {
    // The type is never extracted to its own type alias — validated inline via
    // `z.infer<typeof ...>` at the use site instead. Before the fix (PR #399 review,
    // Codex), only interfaces/type aliases were scanned, so this passed silently.
    const project = fixtureProject({
      [CONTROLLER_FILE]: `
        import { z } from 'zod';
        const CreateDemoBodySchema = z.object({ name: z.string() });
        export class DemoController {
          create(dto: z.infer<typeof CreateDemoBodySchema>): void {}
        }
      `,
    });
    const result = checkBffTypesLiveInModuleFiles(project);
    expectScannedTargets(result, 1);
    expect(result.findings).toEqual([
      expect.objectContaining({
        rule: 'bff-controller-inline-type',
        message: expect.stringContaining('CreateDemoBodySchema'),
      }),
    ]);
  });

  it('flags a schema const declared inside a controller method, not just top-level', () => {
    const project = fixtureProject({
      [CONTROLLER_FILE]: `
        import { z } from 'zod';
        export class DemoController {
          create(): void {
            const CreateDemoBodySchema = z.object({ name: z.string() });
            void CreateDemoBodySchema;
          }
        }
      `,
    });
    const result = checkBffTypesLiveInModuleFiles(project);
    expectScannedTargets(result, 1);
    expect(result.findings).toEqual([
      expect.objectContaining({
        rule: 'bff-controller-inline-type',
        message: expect.stringContaining('CreateDemoBodySchema'),
      }),
    ]);
  });

  it('flags a response interface declared inside a controller method, not just top-level', () => {
    const project = fixtureProject({
      [CONTROLLER_FILE]: `
        export class DemoController {
          get(): unknown {
            interface NestedDemoResponse { id: string }
            const value: NestedDemoResponse = { id: '1' };
            return value;
          }
        }
      `,
    });
    const result = checkBffTypesLiveInModuleFiles(project);
    expectScannedTargets(result, 1);
    expect(result.findings).toEqual([
      expect.objectContaining({
        rule: 'bff-controller-inline-type',
        message: expect.stringContaining('NestedDemoResponse'),
      }),
    ]);
  });

  it('does not flag a non-controller file (e.g. the .schemas.ts sibling itself)', () => {
    const project = fixtureProject({
      'apps/bff/src/features/demo/demo.schemas.ts': `
        import { z } from 'zod';
        export const CreateDemoBodySchema = z.object({ name: z.string() });
        export type CreateDemoBody = z.infer<typeof CreateDemoBodySchema>;
      `,
    });
    expectZeroTargets(checkBffTypesLiveInModuleFiles(project));
  });

  it('respects a documented exception', () => {
    const project = fixtureProject({
      [CONTROLLER_FILE]: `
        export interface LegacyDemoResponse { id: string }
        export class DemoController {
          get(): LegacyDemoResponse { return { id: '1' }; }
        }
      `,
    });
    const result = checkBffTypesLiveInModuleFiles(project, [
      { path: CONTROLLER_FILE, name: 'LegacyDemoResponse' },
    ]);
    expectScannedTargets(result, 1);
    expect(result.findings).toHaveLength(0);
  });
});

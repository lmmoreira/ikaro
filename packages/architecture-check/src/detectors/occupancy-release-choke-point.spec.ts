import { checkOccupancyReleaseChokePoint } from '../index';
import { expectScannedTargets, expectZeroTargets, fixtureProject } from '../testing/fixtures';

const PORT = `
  export interface IResourceOccupancyRepository { release(tenantId: string, ids: string[]): Promise<void> }
`;

describe('checkOccupancyReleaseChokePoint', () => {
  it('flags releaseBookingOccupancy() called from a use case', () => {
    const project = fixtureProject({
      '/repo/apps/backend/src/contexts/booking/application/use-cases/resource-occupancy-assignment.helpers.ts': `
        export async function releaseBookingOccupancy(): Promise<void> {}
      `,
      '/repo/apps/backend/src/contexts/booking/application/use-cases/cancel-something.use-case.ts': `
        import { releaseBookingOccupancy } from './resource-occupancy-assignment.helpers';
        export class CancelSomethingUseCase {
          async execute() { await releaseBookingOccupancy(); }
        }
      `,
    });

    const result = checkOccupancyReleaseChokePoint(project);

    expectScannedTargets(result, 1);
    expect(result.findings).toEqual([
      expect.objectContaining({
        rule: 'occupancy-release-choke-point',
        message: expect.stringContaining('saveTerminalBookingsInTransaction'),
      }),
    ]);
  });

  it('flags a direct IResourceOccupancyRepository.release() call from a use case', () => {
    const project = fixtureProject({
      '/repo/apps/backend/src/contexts/booking/application/ports/resource-occupancy-repository.port.ts':
        PORT,
      '/repo/apps/backend/src/contexts/booking/application/use-cases/cancel-something.use-case.ts': `
        import { IResourceOccupancyRepository } from '../ports/resource-occupancy-repository.port';
        export class CancelSomethingUseCase {
          constructor(private readonly occupancyRepo: IResourceOccupancyRepository) {}
          async execute() { await this.occupancyRepo.release('t', ['l']); }
        }
      `,
    });

    const result = checkOccupancyReleaseChokePoint(project);

    expectScannedTargets(result, 1);
    expect(result.findings).toHaveLength(1);
  });

  it('allows the closing helper, the occupancy helper module and the worklist reassign', () => {
    const project = fixtureProject({
      '/repo/apps/backend/src/contexts/booking/application/ports/resource-occupancy-repository.port.ts':
        PORT,
      '/repo/apps/backend/src/contexts/booking/application/use-cases/resource-occupancy-assignment.helpers.ts': `
        import { IResourceOccupancyRepository } from '../ports/resource-occupancy-repository.port';
        export async function releaseBookingOccupancy(repo: IResourceOccupancyRepository) {
          await repo.release('t', ['l']);
        }
      `,
      '/repo/apps/backend/src/contexts/booking/application/use-cases/booking-exception-closing.helpers.ts': `
        import { releaseBookingOccupancy } from './resource-occupancy-assignment.helpers';
        export async function saveTerminalBookingsInTransaction() { await releaseBookingOccupancy(undefined as never); }
      `,
      '/repo/apps/backend/src/contexts/booking/application/use-cases/resource-reassignment.helpers.ts': `
        import { IResourceOccupancyRepository } from '../ports/resource-occupancy-repository.port';
        export async function moveAffectedRows(repo: IResourceOccupancyRepository) {
          await repo.release('t', ['l']);
        }
      `,
    });

    const result = checkOccupancyReleaseChokePoint(project);

    expectScannedTargets(result, 3);
    expect(result.findings).toEqual([]);
  });

  it('ignores specs and a release() on an unrelated receiver', () => {
    const project = fixtureProject({
      '/repo/apps/backend/src/contexts/booking/application/use-cases/thing.use-case.spec.ts': `
        const repo = { release: async () => {} };
        void repo.release();
      `,
      '/repo/apps/backend/src/contexts/booking/application/use-cases/lock.use-case.ts': `
        export const lock = { release() {} };
        lock.release();
      `,
    });

    expectZeroTargets(checkOccupancyReleaseChokePoint(project));
  });
});

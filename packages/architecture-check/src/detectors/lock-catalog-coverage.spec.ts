import { checkLockCatalogCoverage } from '../index';
import { expectScannedTargets, expectZeroTargets, fixtureProject } from '../testing/fixtures';

const PORT = '/repo/apps/backend/src/contexts/booking/application/ports/thing.port.ts';

describe('checkLockCatalogCoverage', () => {
  it('flags a lock method the catalog never names', () => {
    const project = fixtureProject({
      [PORT]: `export interface IThingLockPort { lockThing(tenantId: string): Promise<void>; }`,
    });

    const result = checkLockCatalogCoverage(project, '#### A1 — lockTenantDay');

    expectScannedTargets(result, 1);
    expect(result.findings).toEqual([
      expect.objectContaining({
        rule: 'lock-catalog-coverage',
        message: expect.stringContaining('IThingLockPort.lockThing()'),
      }),
    ]);
  });

  it('flags a repository ForUpdate method the catalog never names', () => {
    const project = fixtureProject({
      [PORT]: `export interface IThingRepository { findByIdForUpdate(id: string): Promise<void>; findById(id: string): Promise<void>; }`,
    });

    const result = checkLockCatalogCoverage(project, 'nothing here');

    expectScannedTargets(result, 1);
    expect(result.findings).toHaveLength(1);
  });

  it('accepts a lock the catalog names', () => {
    const project = fixtureProject({
      [PORT]: `export interface IThingLockPort { lockThing(tenantId: string): Promise<void>; }`,
    });

    const result = checkLockCatalogCoverage(project, '#### A9 — lockThing(tenantId)');

    expectScannedTargets(result, 1);
    expect(result.findings).toEqual([]);
  });

  it('ignores methods outside a port and methods that do not lock', () => {
    const project = fixtureProject({
      '/repo/apps/backend/src/contexts/booking/application/use-cases/x.use-case.ts': `export interface I { lockThing(): void }`,
      [PORT]: `export interface IThingRepository { findById(id: string): Promise<void>; blockedBy(): void; }`,
    });

    expectZeroTargets(checkLockCatalogCoverage(project, ''));
  });
});

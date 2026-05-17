import { ManagerRoleGuard } from './manager-role.guard';

describe('ManagerRoleGuard', () => {
  it('always returns true (stub until M03 enforces JWT role)', () => {
    const guard = new ManagerRoleGuard();
    expect(guard.canActivate()).toBe(true);
  });
});

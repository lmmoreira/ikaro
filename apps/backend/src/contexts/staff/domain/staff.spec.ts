import { Email } from '../../../shared/value-objects/email.vo';
import { Staff } from './staff.aggregate';
import { StaffDomainError, StaffSelfDeactivationError } from './errors/staff-domain.error';
import { StaffInvited } from './events/staff-invited.event';
import { StaffDeactivated } from './events/staff-deactivated.event';

const CORR = 'corr-test';

describe('Staff', () => {
  describe('invite()', () => {
    it('creates a staff member with isActive=false, null googleOAuthId, name and invitedBy stored', () => {
      const staff = Staff.invite(
        'tenant-1',
        'ana@lavacar.com.br',
        'STAFF',
        'Ana Silva',
        'mgr-id',
        CORR,
      );
      expect(staff.tenantId).toBe('tenant-1');
      expect(staff.email).toBeInstanceOf(Email);
      expect(staff.email.address).toBe('ana@lavacar.com.br');
      expect(staff.role).toBe('STAFF');
      expect(staff.isActive).toBe(false);
      expect(staff.googleOAuthId).toBeNull();
      expect(staff.name).toBe('Ana Silva');
      expect(staff.invitedBy).toBe('mgr-id');
      expect(staff.deactivatedBy).toBeNull();
      expect(staff.id).toBeDefined();
    });

    it('trims whitespace from name', () => {
      const staff = Staff.invite(
        'tenant-1',
        'ana@lavacar.com.br',
        'STAFF',
        '  Ana Silva  ',
        null,
        CORR,
      );
      expect(staff.name).toBe('Ana Silva');
    });

    it('records a StaffInvited domain event with correct tenantId and correlationId', () => {
      const staff = Staff.invite(
        'tenant-1',
        'ana@lavacar.com.br',
        'STAFF',
        'Ana Silva',
        null,
        CORR,
      );
      const events = staff.clearDomainEvents();
      expect(events).toHaveLength(1);
      const event = events[0] as StaffInvited;
      expect(event.eventName).toBe('StaffInvited');
      expect(event.data.staffId).toBe(staff.id);
      expect(event.tenantId).toBe('tenant-1');
      expect(event.correlationId).toBe(CORR);
    });

    it('throws when tenantId is empty', () => {
      expect(() => Staff.invite('', 'a@b.com', 'STAFF', 'Name', null, CORR)).toThrow(
        StaffDomainError,
      );
    });

    it('throws when email is invalid', () => {
      expect(() => Staff.invite('tenant-1', 'not-an-email', 'STAFF', 'Name', null, CORR)).toThrow(
        StaffDomainError,
      );
    });

    it('throws when role is invalid', () => {
      expect(() =>
        Staff.invite('tenant-1', 'a@b.com', 'ADMIN' as never, 'Name', null, CORR),
      ).toThrow(StaffDomainError);
    });

    it('throws when name is empty', () => {
      expect(() => Staff.invite('tenant-1', 'a@b.com', 'STAFF', '', null, CORR)).toThrow(
        StaffDomainError,
      );
    });

    it('throws when name is whitespace-only', () => {
      expect(() => Staff.invite('tenant-1', 'a@b.com', 'STAFF', '   ', null, CORR)).toThrow(
        StaffDomainError,
      );
    });
  });

  describe('activate()', () => {
    it('sets googleOAuthId, name, and isActive=true', () => {
      const staff = Staff.invite(
        'tenant-1',
        'ana@lavacar.com.br',
        'STAFF',
        'Ana Silva',
        null,
        CORR,
      );
      staff.clearDomainEvents();
      staff.activate('google-sub-456', 'Ana Ativada');
      expect(staff.googleOAuthId).toBe('google-sub-456');
      expect(staff.name).toBe('Ana Ativada');
      expect(staff.isActive).toBe(true);
    });

    it('throws when googleOAuthId is empty', () => {
      const staff = Staff.invite(
        'tenant-1',
        'ana@lavacar.com.br',
        'STAFF',
        'Ana Silva',
        null,
        CORR,
      );
      expect(() => staff.activate('', 'Ana')).toThrow(StaffDomainError);
    });

    it('throws when name is whitespace-only', () => {
      const staff = Staff.invite(
        'tenant-1',
        'ana@lavacar.com.br',
        'STAFF',
        'Ana Silva',
        null,
        CORR,
      );
      expect(() => staff.activate('google-sub', '   ')).toThrow(StaffDomainError);
    });
  });

  describe('reinvite()', () => {
    it('updates role, name, invitedBy and records a new StaffInvited event', () => {
      const staff = Staff.invite(
        'tenant-1',
        'ana@lavacar.com.br',
        'STAFF',
        'Ana Silva',
        null,
        CORR,
      );
      staff.clearDomainEvents();
      staff.reinvite('MANAGER', 'Ana Atualizada', 'new-mgr-id', CORR);
      expect(staff.role).toBe('MANAGER');
      expect(staff.name).toBe('Ana Atualizada');
      expect(staff.invitedBy).toBe('new-mgr-id');
      const events = staff.clearDomainEvents();
      expect(events).toHaveLength(1);
      expect((events[0] as StaffInvited).eventName).toBe('StaffInvited');
    });
  });

  describe('deactivate()', () => {
    it('sets isActive=false, stores deactivatedBy, records StaffDeactivated event', () => {
      const staff = Staff.invite(
        'tenant-1',
        'ana@lavacar.com.br',
        'STAFF',
        'Ana Silva',
        null,
        CORR,
      );
      staff.clearDomainEvents();
      staff.activate('google-sub-789', 'Ana Silva');
      staff.deactivate('other-staff-id', CORR);
      expect(staff.isActive).toBe(false);
      expect(staff.deactivatedBy).toBe('other-staff-id');
      const events = staff.clearDomainEvents();
      expect(events).toHaveLength(1);
      const event = events[0] as StaffDeactivated;
      expect(event.eventName).toBe('StaffDeactivated');
      expect(event.data.staffId).toBe(staff.id);
    });

    it('throws StaffSelfDeactivationError when deactivatedBy equals own id', () => {
      const staff = Staff.invite(
        'tenant-1',
        'ana@lavacar.com.br',
        'STAFF',
        'Ana Silva',
        null,
        CORR,
      );
      staff.activate('google-sub-789', 'Ana Silva');
      expect(() => staff.deactivate(staff.id, CORR)).toThrow(StaffSelfDeactivationError);
      expect(staff.isActive).toBe(true);
    });
  });
});

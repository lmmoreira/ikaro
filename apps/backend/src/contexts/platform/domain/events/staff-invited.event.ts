import { DomainEvent } from '../../../../shared/domain/domain-event';

export type StaffRole = 'MANAGER' | 'STAFF';

interface StaffInvitedData extends Record<string, unknown> {
  staffId: string;
  tenantId: string;
  email: string;
  firstName: string;
  lastName: string;
  role: StaffRole;
  invitedBy: string;
}

export class StaffInvited extends DomainEvent<StaffInvitedData> {
  readonly eventName = 'StaffInvited';
  readonly eventVersion = 1;
  readonly data: StaffInvitedData;

  constructor(
    tenantId: string,
    correlationId: string,
    staffId: string,
    email: string,
    firstName: string,
    lastName: string,
    role: StaffRole,
    invitedBy: string,
  ) {
    super(tenantId, correlationId);
    this.data = { staffId, tenantId, email, firstName, lastName, role, invitedBy };
  }
}

import { DomainEvent } from '../../../../shared/domain/domain-event';
import { StaffRole } from '../staff.aggregate';

interface StaffInvitedData extends Record<string, unknown> {
  staffId: string;
  tenantId: string;
  email: string;
  firstName: string;
  lastName: string;
  role: StaffRole;
  invitedBy: string;
}

export interface StaffInvitedParams {
  staffId: string;
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

  constructor(tenantId: string, correlationId: string, params: StaffInvitedParams) {
    super(tenantId, correlationId);
    this.data = { tenantId, ...params };
  }
}

import { DomainEvent } from '../../../../shared/domain/domain-event';

interface StaffInvitedData extends Record<string, unknown> {
  staffId: string;
}

export class StaffInvited extends DomainEvent<StaffInvitedData> {
  readonly eventName = 'StaffInvited';
  readonly eventVersion = 1;
  readonly data: StaffInvitedData;

  constructor(tenantId: string, correlationId: string, data: StaffInvitedData) {
    super(tenantId, correlationId);
    this.data = data;
  }
}

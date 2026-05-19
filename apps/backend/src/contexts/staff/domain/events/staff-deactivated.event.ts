import { DomainEvent } from '../../../../shared/domain/domain-event';

interface StaffDeactivatedData extends Record<string, unknown> {
  staffId: string;
  tenantId: string;
  deactivatedBy: string;
}

export class StaffDeactivated extends DomainEvent<StaffDeactivatedData> {
  readonly eventName = 'StaffDeactivated';
  readonly eventVersion = 1;
  readonly data: StaffDeactivatedData;

  constructor(tenantId: string, correlationId: string, staffId: string, deactivatedBy: string) {
    super(tenantId, correlationId);
    this.data = { staffId, tenantId, deactivatedBy };
  }
}

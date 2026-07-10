import { DomainEvent } from '../../../../shared/domain/domain-event';

interface StaffDeactivatedData extends Record<string, unknown> {
  staffId: string;
}

export class StaffDeactivated extends DomainEvent<StaffDeactivatedData> {
  readonly eventVersion = 1;
  readonly data: StaffDeactivatedData;

  constructor(tenantId: string, correlationId: string, data: StaffDeactivatedData) {
    super(tenantId, correlationId);
    this.data = data;
  }
}

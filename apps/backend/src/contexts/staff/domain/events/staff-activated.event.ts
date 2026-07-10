import { DomainEvent } from '../../../../shared/domain/domain-event';

interface StaffActivatedData extends Record<string, unknown> {
  staffId: string;
}

export class StaffActivated extends DomainEvent<StaffActivatedData> {
  readonly eventVersion = 1;
  readonly data: StaffActivatedData;

  constructor(tenantId: string, correlationId: string, data: StaffActivatedData) {
    super(tenantId, correlationId);
    this.data = data;
  }
}

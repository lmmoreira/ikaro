import { StaffInvited } from '../../../contexts/staff/domain/events/staff-invited.event';

export class StaffInvitedEventBuilder {
  private tenantId = 'aaaaaaaa-0000-4000-8000-000000000001';
  private correlationId = 'corr-handler-test';
  private staffId = 'bbbbbbbb-0000-4000-8000-000000000001';

  withTenantId(tenantId: string): this {
    this.tenantId = tenantId;
    return this;
  }

  withCorrelationId(correlationId: string): this {
    this.correlationId = correlationId;
    return this;
  }

  withStaffId(staffId: string): this {
    this.staffId = staffId;
    return this;
  }

  build(): StaffInvited {
    return new StaffInvited(this.tenantId, this.correlationId, { staffId: this.staffId });
  }
}

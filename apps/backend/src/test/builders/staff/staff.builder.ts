import { Staff, StaffRole } from '../../../contexts/staff/domain/staff.aggregate';

const DEFAULT_CORRELATION = 'corr-test-builder';

export class StaffBuilder {
  private tenantId = 'tenant-id-1';
  private email = 'staff@example.com';
  private role: StaffRole = 'STAFF';
  private name = 'Test User';
  private invitedBy: string | null = null;
  private googleOAuthId: string | null = null;

  withTenantId(tenantId: string): this {
    this.tenantId = tenantId;
    return this;
  }

  withEmail(email: string): this {
    this.email = email;
    return this;
  }

  withRole(role: StaffRole): this {
    this.role = role;
    return this;
  }

  withName(name: string): this {
    this.name = name;
    return this;
  }

  withInvitedBy(invitedBy: string | null): this {
    this.invitedBy = invitedBy;
    return this;
  }

  withGoogleOAuthId(googleOAuthId: string): this {
    this.googleOAuthId = googleOAuthId;
    return this;
  }

  build(): Staff {
    const staff = Staff.invite(
      this.tenantId,
      this.email,
      this.role,
      this.name,
      this.invitedBy,
      DEFAULT_CORRELATION,
    );
    staff.clearDomainEvents(); // builders don't produce events in tests
    if (this.googleOAuthId) {
      staff.activate(this.googleOAuthId, this.name);
    }
    return staff;
  }
}

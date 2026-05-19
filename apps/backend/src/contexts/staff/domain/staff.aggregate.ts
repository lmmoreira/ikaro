import { AggregateRoot } from '../../../shared/domain/aggregate-root';
import { uuidv7 } from '../../../shared/domain/uuid-v7';
import { Email } from '../../../shared/value-objects/email.vo';
import { StaffDomainError, StaffSelfDeactivationError } from './errors/staff-domain.error';

export type StaffRole = 'MANAGER' | 'STAFF';

export interface StaffProps {
  id: string;
  tenantId: string;
  googleOAuthId: string | null;
  name: string | null;
  email: Email;
  role: StaffRole;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export class Staff extends AggregateRoot {
  private readonly props: StaffProps;

  private constructor(props: StaffProps) {
    super();
    this.props = props;
  }

  get id(): string {
    return this.props.id;
  }
  get tenantId(): string {
    return this.props.tenantId;
  }
  get googleOAuthId(): string | null {
    return this.props.googleOAuthId;
  }
  get name(): string | null {
    return this.props.name;
  }
  get email(): Email {
    return this.props.email;
  }
  get role(): StaffRole {
    return this.props.role;
  }
  get isActive(): boolean {
    return this.props.isActive;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  static invite(tenantId: string, email: string, role: StaffRole): Staff {
    if (!tenantId) throw new StaffDomainError('tenantId is required');
    if (!Email.isValid(email)) throw new StaffDomainError('email must be a valid email address');
    if (role !== 'MANAGER' && role !== 'STAFF') {
      throw new StaffDomainError('role must be MANAGER or STAFF');
    }

    const now = new Date();
    return new Staff({
      id: uuidv7(),
      tenantId,
      googleOAuthId: null,
      name: null,
      email: Email.create(email),
      role,
      isActive: false,
      createdAt: now,
      updatedAt: now,
    });
  }

  static reconstitute(props: StaffProps): Staff {
    return new Staff(props);
  }

  activate(googleOAuthId: string, name: string): void {
    if (!googleOAuthId) throw new StaffDomainError('googleOAuthId is required to activate staff');
    const trimmedName = name?.trim();
    if (!trimmedName) throw new StaffDomainError('name is required to activate staff');
    this.props.googleOAuthId = googleOAuthId;
    this.props.name = trimmedName;
    this.props.isActive = true;
    this.props.updatedAt = new Date();
  }

  reinvite(role: StaffRole): void {
    this.props.role = role;
    this.props.updatedAt = new Date();
  }

  deactivate(deactivatedBy: string): void {
    if (this.props.id === deactivatedBy) throw new StaffSelfDeactivationError();
    this.props.isActive = false;
    this.props.updatedAt = new Date();
  }
}

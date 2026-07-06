import { AggregateRoot } from '../../../shared/domain/aggregate-root';
import { SYSTEM_ACTOR_ID } from '../../../shared/domain/system-actor';
import { uuidv7 } from '../../../shared/domain/uuid-v7';
import { Email } from '../../../shared/value-objects/email.vo';
import { normalizeText } from '../../../shared/utils/text-normalization';
import { StaffActivated } from './events/staff-activated.event';
import { StaffDeactivated } from './events/staff-deactivated.event';
import { StaffInvited } from './events/staff-invited.event';
import {
  StaffDomainError,
  StaffGoogleAccountConflictError,
  StaffSelfDeactivationError,
  StaffSelfReactivationError,
} from './errors/staff-domain.error';

export type StaffRole = 'MANAGER' | 'STAFF';

export interface StaffProps {
  id: string;
  tenantId: string;
  googleOAuthId: string | null;
  name: string | null;
  email: Email;
  role: StaffRole;
  isActive: boolean;
  invitedBy: string | null;
  deactivatedBy: string | null;
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
  get invitedBy(): string | null {
    return this.props.invitedBy;
  }
  get deactivatedBy(): string | null {
    return this.props.deactivatedBy;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  static invite(
    tenantId: string,
    email: string,
    role: StaffRole,
    name: string,
    invitedBy: string | null,
    correlationId: string,
  ): Staff {
    if (!tenantId) throw new StaffDomainError('tenantId is required');
    if (!Email.isValid(email)) throw new StaffDomainError('email must be a valid email address');
    if (role !== 'MANAGER' && role !== 'STAFF') {
      throw new StaffDomainError('role must be MANAGER or STAFF');
    }
    const trimmedName = normalizeText(name);
    if (!trimmedName) throw new StaffDomainError('name is required to invite staff');

    const now = new Date();
    const staff = new Staff({
      id: uuidv7(),
      tenantId,
      googleOAuthId: null,
      name: trimmedName,
      email: Email.create(email),
      role,
      isActive: true,
      invitedBy,
      deactivatedBy: null,
      createdAt: now,
      updatedAt: now,
    });

    staff.addDomainEvent(new StaffInvited(tenantId, correlationId, { staffId: staff.id }));

    return staff;
  }

  static inviteFromProvisioning(tenantId: string, email: string, correlationId: string): Staff {
    if (!tenantId) throw new StaffDomainError('tenantId is required');
    if (!Email.isValid(email)) throw new StaffDomainError('email must be a valid email address');

    const now = new Date();
    const staff = new Staff({
      id: uuidv7(),
      tenantId,
      googleOAuthId: null,
      name: null,
      email: Email.create(email),
      role: 'MANAGER',
      isActive: true,
      invitedBy: SYSTEM_ACTOR_ID,
      deactivatedBy: null,
      createdAt: now,
      updatedAt: now,
    });

    staff.addDomainEvent(new StaffInvited(tenantId, correlationId, { staffId: staff.id }));

    return staff;
  }

  static reconstitute(props: StaffProps): Staff {
    return new Staff(props);
  }

  linkGoogleAccount(googleOAuthId: string, name: string): void {
    if (!googleOAuthId) throw new StaffDomainError('googleOAuthId is required');
    const trimmedName = normalizeText(name);
    if (!trimmedName) throw new StaffDomainError('name is required');
    if (this.props.googleOAuthId && this.props.googleOAuthId !== googleOAuthId) {
      throw new StaffGoogleAccountConflictError();
    }
    this.props.googleOAuthId = googleOAuthId;
    this.props.name = trimmedName;
    this.props.updatedAt = new Date();
  }

  reinvite(role: StaffRole, name: string, invitedBy: string | null, correlationId: string): void {
    const trimmedName = normalizeText(name);
    if (!trimmedName) throw new StaffDomainError('name is required to reinvite staff');
    this.props.role = role;
    this.props.name = trimmedName;
    this.props.invitedBy = invitedBy;
    this.props.updatedAt = new Date();
    this.addDomainEvent(
      new StaffInvited(this.props.tenantId, correlationId, { staffId: this.props.id }),
    );
  }

  // Admin edits name/role from the team detail screen (UC-030). No domain event —
  // matches Service.update()/linkGoogleAccount()'s precedent: nothing today needs to
  // react to a profile edit. The last-active-manager guard for a MANAGER->STAFF
  // demotion lives in the use case (it needs to query sibling staff rows).
  updateProfile(name: string, role: StaffRole): void {
    const trimmedName = normalizeText(name);
    if (!trimmedName) throw new StaffDomainError('name is required');
    this.props.name = trimmedName;
    this.props.role = role;
    this.props.updatedAt = new Date();
  }

  deactivate(deactivatedBy: string, correlationId: string): void {
    if (this.props.id === deactivatedBy) throw new StaffSelfDeactivationError();
    this.props.isActive = false;
    this.props.deactivatedBy = deactivatedBy;
    this.props.updatedAt = new Date();
    this.addDomainEvent(
      new StaffDeactivated(this.props.tenantId, correlationId, { staffId: this.props.id }),
    );
  }

  activate(activatedBy: string, correlationId: string): void {
    if (this.props.id === activatedBy) throw new StaffSelfReactivationError();
    this.props.isActive = true;
    this.props.deactivatedBy = null;
    this.props.updatedAt = new Date();
    this.addDomainEvent(
      new StaffActivated(this.props.tenantId, correlationId, { staffId: this.props.id }),
    );
  }
}

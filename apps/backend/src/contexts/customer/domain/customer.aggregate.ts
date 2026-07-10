import { CustomerErrorCode } from '@ikaro/types';
import { AggregateRoot } from '../../../shared/domain/aggregate-root';
import { uuidv7 } from '../../../shared/domain/uuid-v7';
import { Address } from '../../../shared/value-objects/address';
import { Email } from '../../../shared/value-objects/email.vo';
import { PhoneNumber } from '../../../shared/value-objects/phone-number.vo';
import { normalizeText } from '../../../shared/utils/text-normalization';
import { CustomerDomainError } from './errors/customer-domain.error';

export interface CustomerProps {
  id: string;
  tenantId: string;
  googleOAuthId: string;
  email: Email;
  name: string;
  phone: PhoneNumber | null;
  defaultAddress: Address | null;
  createdAt: Date;
  updatedAt: Date;
}

export class Customer extends AggregateRoot {
  private readonly props: CustomerProps;

  private constructor(props: CustomerProps) {
    super();
    this.props = props;
  }

  get id(): string {
    return this.props.id;
  }
  get tenantId(): string {
    return this.props.tenantId;
  }
  get googleOAuthId(): string {
    return this.props.googleOAuthId;
  }
  get email(): Email {
    return this.props.email;
  }
  get name(): string {
    return this.props.name;
  }
  get phone(): PhoneNumber | null {
    return this.props.phone;
  }
  get defaultAddress(): Address | null {
    return this.props.defaultAddress;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  static create(tenantId: string, googleOAuthId: string, email: string, name: string): Customer {
    if (!tenantId) {
      throw new CustomerDomainError('tenantId is required', CustomerErrorCode.TENANT_ID_REQUIRED);
    }
    if (!googleOAuthId) {
      throw new CustomerDomainError(
        'googleOAuthId is required',
        CustomerErrorCode.GOOGLE_OAUTH_ID_REQUIRED,
      );
    }
    if (!Email.isValid(email)) {
      throw new CustomerDomainError(
        'email must be a valid email address',
        CustomerErrorCode.EMAIL_INVALID,
      );
    }
    const normalizedName = normalizeText(name);
    if (!normalizedName) {
      throw new CustomerDomainError('name must not be empty', CustomerErrorCode.NAME_REQUIRED);
    }

    const now = new Date();
    return new Customer({
      id: uuidv7(),
      tenantId,
      googleOAuthId,
      email: Email.create(email),
      name: normalizedName,
      phone: null,
      defaultAddress: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  static reconstitute(props: CustomerProps): Customer {
    return new Customer(props);
  }

  updateProfile(name: string, phone: string | null, defaultAddress: Address | null): void {
    const normalizedName = normalizeText(name);
    if (!normalizedName) {
      throw new CustomerDomainError(
        'name must not be empty',
        CustomerErrorCode.NAME_REQUIRED,
        'name',
      );
    }
    if (phone !== null && !PhoneNumber.isValid(phone)) {
      throw new CustomerDomainError(
        'phone must be a valid E.164 phone number (e.g. +5511912345678)',
        CustomerErrorCode.PHONE_INVALID,
        'phone',
      );
    }
    this.props.name = normalizedName;
    this.props.phone = phone === null ? null : PhoneNumber.create(phone);
    this.props.defaultAddress = defaultAddress;
    this.props.updatedAt = new Date();
  }
}

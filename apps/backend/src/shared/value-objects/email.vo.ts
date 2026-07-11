import { EmailErrorCode } from '@ikaro/types';
import { DomainErrorShape } from '../domain/domain-error-shape';
import { ValueObject } from '../domain/value-object';

interface EmailProps {
  address: string;
}

export class EmailValidationError extends Error implements DomainErrorShape {
  readonly code: EmailErrorCode;

  constructor(message: string, code: EmailErrorCode) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = 'EmailValidationError';
    this.code = code;
  }
}

export class Email extends ValueObject<EmailProps> {
  private constructor(props: EmailProps) {
    super(props);
  }

  static isValid(address: string): boolean {
    const atIdx = address.indexOf('@');
    if (atIdx <= 0) return false;
    const domain = address.slice(atIdx + 1);
    const dotIdx = domain.lastIndexOf('.');
    return domain.length > 0 && dotIdx > 0 && dotIdx < domain.length - 1;
  }

  static create(address: string): Email {
    if (!Email.isValid(address)) {
      throw new EmailValidationError(
        `"${address}" is not a valid email address`,
        EmailErrorCode.FORMAT_INVALID,
      );
    }
    return new Email({ address: address.toLowerCase().trim() });
  }

  static reconstitute(address: string): Email {
    return new Email({ address });
  }

  get address(): string {
    return this.props.address;
  }

  toString(): string {
    return this.props.address;
  }
}

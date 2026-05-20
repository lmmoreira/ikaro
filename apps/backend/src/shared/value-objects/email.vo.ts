import { ValueObject } from '../domain/value-object';

interface EmailProps {
  address: string;
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
      throw new Error(`"${address}" is not a valid email address`);
    }
    return new Email({ address: address.toLowerCase().trim() });
  }

  get address(): string {
    return this.props.address;
  }

  toString(): string {
    return this.props.address;
  }
}

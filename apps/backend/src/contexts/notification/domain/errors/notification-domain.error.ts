export class NotificationDomainError extends Error {
  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = 'NotificationDomainError';
  }
}

export class EmailDeliveryException extends NotificationDomainError {
  constructor(cause: string) {
    super(`Email delivery failed: ${cause}`);
    this.name = 'EmailDeliveryException';
  }
}

export class CustomerDomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CustomerDomainError';
  }
}

export class CustomerNotFoundError extends CustomerDomainError {
  constructor(customerId: string) {
    super(`Customer not found: ${customerId}`);
    this.name = 'CustomerNotFoundError';
  }
}

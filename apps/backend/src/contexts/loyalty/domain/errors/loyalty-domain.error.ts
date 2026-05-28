export class LoyaltyDomainError extends Error {
  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = 'LoyaltyDomainError';
  }
}

export class LoyaltyInvalidPointsError extends LoyaltyDomainError {
  constructor() {
    super('points must be greater than zero');
    this.name = 'LoyaltyInvalidPointsError';
  }
}

export class LoyaltyEntryNotFoundError extends LoyaltyDomainError {
  constructor(id: string) {
    super(`LoyaltyEntry not found: ${id}`);
    this.name = 'LoyaltyEntryNotFoundError';
  }
}

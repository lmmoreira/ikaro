import { LoyaltyErrorCode } from '@ikaro/types';
import { DomainErrorShape } from '../../../../shared/domain/domain-error-shape';

export class LoyaltyDomainError extends Error implements DomainErrorShape {
  readonly code: LoyaltyErrorCode;
  readonly field?: string;

  constructor(message: string, code: LoyaltyErrorCode, field?: string) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = 'LoyaltyDomainError';
    this.code = code;
    this.field = field;
  }
}

export class LoyaltyInvalidPointsError extends LoyaltyDomainError {
  constructor() {
    super('points must be greater than zero', LoyaltyErrorCode.INVALID_POINTS);
    this.name = 'LoyaltyInvalidPointsError';
  }
}

export class LoyaltyInsufficientPointsError extends LoyaltyDomainError {
  constructor() {
    super('insufficient points to complete this operation', LoyaltyErrorCode.INSUFFICIENT_POINTS);
    this.name = 'LoyaltyInsufficientPointsError';
  }
}

export class LoyaltyBalanceNotFoundError extends LoyaltyDomainError {
  constructor() {
    super('no loyalty balance found for this customer', LoyaltyErrorCode.BALANCE_NOT_FOUND);
    this.name = 'LoyaltyBalanceNotFoundError';
  }
}

export class LoyaltyCustomerNotFoundInTenantError extends LoyaltyDomainError {
  constructor() {
    super(
      'customer has no record in the requested tenant',
      LoyaltyErrorCode.CUSTOMER_NOT_FOUND_IN_TENANT,
    );
    this.name = 'LoyaltyCustomerNotFoundInTenantError';
  }
}

import { BookingErrorCode } from '@ikaro/types/protocol/errors';
import { DomainErrorShape } from '../../../../shared/domain/domain-error-shape';

// Split out of booking-domain.error.ts (TD37-S05) into its own file with zero imports from any
// sibling error file. booking-domain.error.ts re-exports every split error file (TD37-S05,
// file-length) via `export *`, and every split file needs this base class — importing it from
// booking-domain.error.ts itself would be circular (booking-domain.error.ts's own `export *`
// requires the split file, which requires BookingDomainError back from booking-domain.error.ts,
// which isn't done executing yet). Confirmed as a real bug, not a theoretical one: it crashed
// backend boot under ts-node with "Cannot access 'X' before initialization" — the equivalent
// chatbot-domain.error.ts/platform-domain.error.ts cycle hit the identical error in CI.
export class BookingDomainError extends Error implements DomainErrorShape {
  readonly code: BookingErrorCode;
  readonly field?: string;

  constructor(message: string, code: BookingErrorCode, field?: string) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = 'BookingDomainError';
    this.code = code;
    this.field = field;
  }
}

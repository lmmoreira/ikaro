import { FutureCommitmentExceptionBuilder } from '../../../test/builders/booking/index';
import { FutureCommitmentExceptionAlreadyResolvedError } from './errors/future-commitment-exception.error';
import { FutureCommitmentExceptionDismissed } from './events/future-commitment-exception-dismissed.event';
import { FutureCommitmentExceptionRaised } from './events/future-commitment-exception-raised.event';
import { FutureCommitmentExceptionResolved } from './events/future-commitment-exception-resolved.event';

const STAFF_ID = '00000000-0000-7000-8000-0000000000aa';
const CORRELATION_ID = 'corr-1';

describe('FutureCommitmentException', () => {
  describe('raise', () => {
    it('creates an OPEN, manager-owned-by-nobody entry and records FutureCommitmentExceptionRaised', () => {
      const exception = new FutureCommitmentExceptionBuilder()
        .withAlternatives([{ resourceId: 'r-2', resourceName: 'Sala 2' }])
        .withCorrelationId(CORRELATION_ID)
        .build();

      expect(exception.status).toBe('OPEN');
      expect(exception.sourceType).toBe('RESOURCE_DEACTIVATION');
      expect(exception.affectedType).toBe('BOOKING');
      expect(exception.ownerStaffId).toBeNull();
      expect(exception.resolutionType).toBeNull();
      expect(exception.alternatives).toEqual([{ resourceId: 'r-2', resourceName: 'Sala 2' }]);

      const events = exception.clearDomainEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(FutureCommitmentExceptionRaised);
      expect(events[0].correlationId).toBe(CORRELATION_ID);
      expect((events[0] as FutureCommitmentExceptionRaised).data).toEqual({
        exceptionId: exception.id,
        sourceType: 'RESOURCE_DEACTIVATION',
        sourceId: exception.sourceId,
        affectedType: 'BOOKING',
        affectedId: exception.affectedId,
        ownerStaffId: null,
      });
    });
  });

  describe('refreshAlternatives', () => {
    it('replaces the advisory alternatives of an open entry without announcing it again', () => {
      const exception = new FutureCommitmentExceptionBuilder().build();
      exception.clearDomainEvents();

      exception.refreshAlternatives([{ resourceId: 'r-3', resourceName: 'Sala 3' }]);

      expect(exception.alternatives).toEqual([{ resourceId: 'r-3', resourceName: 'Sala 3' }]);
      expect(exception.clearDomainEvents()).toHaveLength(0);
    });

    it('rejects a closed entry', () => {
      const exception = new FutureCommitmentExceptionBuilder().build();
      exception.dismiss(STAFF_ID, 'no action needed', CORRELATION_ID);

      expect(() => exception.refreshAlternatives([])).toThrow(
        FutureCommitmentExceptionAlreadyResolvedError,
      );
    });
  });

  describe('resolve', () => {
    it('records the decision, the actor and the reason, and publishes Resolved', () => {
      const exception = new FutureCommitmentExceptionBuilder().build();
      exception.clearDomainEvents();

      exception.resolve(STAFF_ID, 'REASSIGN', 'moved to Sala 2', CORRELATION_ID);

      expect(exception.status).toBe('RESOLVED');
      expect(exception.resolutionType).toBe('REASSIGN');
      expect(exception.resolutionReason).toBe('moved to Sala 2');
      expect(exception.resolvedByStaffId).toBe(STAFF_ID);
      expect(exception.resolvedAt).toBeInstanceOf(Date);

      const [event] = exception.clearDomainEvents();
      expect(event).toBeInstanceOf(FutureCommitmentExceptionResolved);
      expect((event as FutureCommitmentExceptionResolved).data).toEqual({
        exceptionId: exception.id,
        resolutionType: 'REASSIGN',
        resolvedByStaffId: STAFF_ID,
        affectedType: 'BOOKING',
        affectedId: exception.affectedId,
      });
    });

    it('rejects an entry that is not OPEN', () => {
      const exception = new FutureCommitmentExceptionBuilder().build();
      exception.resolve(STAFF_ID, 'KEEP', null, CORRELATION_ID);

      expect(() => exception.resolve(STAFF_ID, 'CANCEL', null, CORRELATION_ID)).toThrow(
        FutureCommitmentExceptionAlreadyResolvedError,
      );
    });
  });

  describe('dismiss', () => {
    it('closes the entry with the reason and publishes Dismissed', () => {
      const exception = new FutureCommitmentExceptionBuilder().build();
      exception.clearDomainEvents();

      exception.dismiss(STAFF_ID, 'handled by phone', CORRELATION_ID);

      expect(exception.status).toBe('DISMISSED');
      expect(exception.resolutionType).toBeNull();
      expect(exception.resolutionReason).toBe('handled by phone');
      expect(exception.resolvedByStaffId).toBe(STAFF_ID);

      const [event] = exception.clearDomainEvents();
      expect(event).toBeInstanceOf(FutureCommitmentExceptionDismissed);
      expect((event as FutureCommitmentExceptionDismissed).data).toEqual({
        exceptionId: exception.id,
        resolvedByStaffId: STAFF_ID,
        resolutionReason: 'handled by phone',
      });
    });

    it('rejects an entry that is not OPEN', () => {
      const exception = new FutureCommitmentExceptionBuilder().build();
      exception.dismiss(STAFF_ID, 'first', CORRELATION_ID);

      expect(() => exception.dismiss(STAFF_ID, 'second', CORRELATION_ID)).toThrow(
        FutureCommitmentExceptionAlreadyResolvedError,
      );
    });
  });
});

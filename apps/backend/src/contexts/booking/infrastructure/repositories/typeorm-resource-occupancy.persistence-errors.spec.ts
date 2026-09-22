import { QueryFailedError } from 'typeorm';
import { BookingSlotUnavailableError } from '../../domain/errors/booking-domain.error';
import { rethrowOccupancyInsertError } from './typeorm-resource-occupancy.persistence-errors';

function buildQueryFailedError(code: string, constraint: string): QueryFailedError {
  return new QueryFailedError(
    'INSERT INTO booking.resource_occupancy ...',
    [],
    Object.assign(new Error(), { code, constraint }),
  );
}

describe('rethrowOccupancyInsertError', () => {
  it('maps the resource_occupancy exclusion-constraint violation to BookingSlotUnavailableError', () => {
    const err = buildQueryFailedError('23P01', 'EX_booking_resource_occupancy_locked_window');

    expect(() => rethrowOccupancyInsertError(err)).toThrow(BookingSlotUnavailableError);
  });

  it('rethrows a QueryFailedError with the right code but an unrelated constraint unchanged', () => {
    const err = buildQueryFailedError('23P01', 'some_other_constraint');

    expect(() => rethrowOccupancyInsertError(err)).toThrow(err);
  });

  it('rethrows a QueryFailedError with an unrelated code unchanged', () => {
    const err = buildQueryFailedError('23505', 'EX_booking_resource_occupancy_locked_window');

    expect(() => rethrowOccupancyInsertError(err)).toThrow(err);
  });

  it('rethrows a non-QueryFailedError unchanged', () => {
    const err = new Error('boom');

    expect(() => rethrowOccupancyInsertError(err)).toThrow(err);
  });
});

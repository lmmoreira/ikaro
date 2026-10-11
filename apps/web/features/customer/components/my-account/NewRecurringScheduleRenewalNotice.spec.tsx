// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { RecurringBookingScheduleListItem } from '@ikaro/types';
import { renderWithIntl } from '@/test-utils';
import { NewRecurringScheduleRenewalNotice } from './NewRecurringScheduleRenewalNotice';

const renewing: RecurringBookingScheduleListItem = {
  id: 'old-1',
  customerId: 'c1',
  serviceId: 's1',
  serviceName: 'Sala Aurora',
  recurrence: {
    frequency: 'WEEKLY',
    daysOfWeek: ['tuesday'],
    startTime: '10:00',
    durationMinutes: 120,
  },
  startsOn: '2026-08-19',
  endsOn: '2026-11-11',
  status: 'ENDED',
  assignmentPolicy: 'RESOLVE_PER_OCCURRENCE',
  resourceIds: [],
  approvalHoldExpiresAt: null,
};

describe('NewRecurringScheduleRenewalNotice', () => {
  it('names the service and the previous term in the banner', () => {
    renderWithIntl(<NewRecurringScheduleRenewalNotice renewing={renewing} />);

    const banner = screen.getByTestId('new-schedule-renewal-banner');
    expect(banner).toHaveTextContent('Renovando sua reserva de Sala Aurora');
    expect(banner).toHaveTextContent('Toda terça');
    expect(banner).toHaveTextContent('nada é reservado até você confirmar');
  });

  it('shows the not-found notice when there is nothing to renew', () => {
    renderWithIntl(<NewRecurringScheduleRenewalNotice renewing={null} />);

    expect(screen.getByTestId('new-schedule-renewal-not-found')).toHaveTextContent(
      'Não encontramos a reserva que você queria renovar. Você pode criar uma nova reserva recorrente abaixo.',
    );
  });
});

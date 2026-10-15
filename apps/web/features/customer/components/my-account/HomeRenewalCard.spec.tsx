// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import type { RecurringBookingScheduleListItem } from '@ikaro/types';
import ptBRMessages from '@ikaro/i18n/locales/pt-BR/web.json';
import { FormattingProvider } from '@/providers/formatting-provider';
import type { RenewalSelection } from '../../home-widgets';
import { HomeRenewalCard } from './HomeRenewalCard';

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...rest
  }: React.PropsWithChildren<{ href: string } & Record<string, unknown>>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const schedule: RecurringBookingScheduleListItem = {
  id: 'sched-7',
  customerId: 'c1',
  serviceId: 's1',
  serviceName: 'Sala Horizonte',
  recurrence: {
    frequency: 'WEEKLY',
    daysOfWeek: ['friday'],
    startTime: '16:00',
    durationMinutes: 120,
  },
  startsOn: '2026-06-01',
  endsOn: '2026-08-29',
  status: 'ACTIVE',
  assignmentPolicy: 'FIXED_ASSIGNMENT',
  approvalHoldExpiresAt: null,
  renewable: true,
};

// The real pt-BR messages, so the plural wording ("hoje" / "amanhã" / "em N dias") and the keys
// themselves are exercised, not a copy of them.
function renderCard(selection: RenewalSelection) {
  return render(
    <NextIntlClientProvider locale="pt-BR" messages={ptBRMessages}>
      <FormattingProvider
        locale="pt-BR"
        currency="BRL"
        timezone="America/Sao_Paulo"
        dateFormat="DD/MM/YYYY"
        timeFormat="24h"
      >
        <HomeRenewalCard selection={selection} tenantSlug="lavacar" />
      </FormattingProvider>
    </NextIntlClientProvider>,
  );
}

describe('HomeRenewalCard — one schedule ending', () => {
  it('names the service and the days left, with the recurrence and the end date', () => {
    renderCard({ kind: 'one', schedule, daysLeft: 7 });

    expect(screen.getByTestId('home-renewal-title')).toHaveTextContent(
      'Sala Horizonte termina em 7 dias',
    );
    const card = screen.getByTestId('home-renewal-card');
    expect(card).toHaveTextContent('Toda sexta');
    expect(card).toHaveTextContent('16:00');
    expect(card).toHaveTextContent('29/08/2026');
  });

  it.each([
    [0, 'Sala Horizonte termina hoje'],
    [1, 'Sala Horizonte termina amanhã'],
    [2, 'Sala Horizonte termina em 2 dias'],
  ])('says it in words for %s day(s) left', (daysLeft, title) => {
    renderCard({ kind: 'one', schedule, daysLeft });

    expect(screen.getByTestId('home-renewal-title')).toHaveTextContent(title);
  });

  it('opens the renewal form pre-filled from that schedule', () => {
    renderCard({ kind: 'one', schedule, daysLeft: 7 });

    const action = screen.getByTestId('home-renewal-action');
    expect(action).toHaveTextContent('Renovar');
    expect(action).toHaveAttribute(
      'href',
      '/lavacar/my-account/recurring-schedules/new?renewFrom=sched-7',
    );
  });
});

describe('HomeRenewalCard — several schedules ending', () => {
  it('says how many are ending and when the first one does', () => {
    renderCard({ kind: 'many', count: 2, firstDaysLeft: 3 });

    expect(screen.getByTestId('home-renewal-title')).toHaveTextContent('2 reservas terminando');
    expect(screen.getByTestId('home-renewal-card')).toHaveTextContent(
      'A primeira termina em 3 dias',
    );
  });

  it('sends the customer to the recurring list instead of a renewal form', () => {
    renderCard({ kind: 'many', count: 2, firstDaysLeft: 3 });

    const action = screen.getByTestId('home-renewal-action');
    expect(action).toHaveTextContent('Ver reservas');
    expect(action).toHaveAttribute('href', '/lavacar/my-account/recurring-schedules');
  });
});

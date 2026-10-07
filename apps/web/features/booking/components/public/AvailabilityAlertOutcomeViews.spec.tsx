// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { AvailabilityAlertResponse } from '@ikaro/types';
import { axe } from '@/axe-helper';
import { renderWithIntl } from '@/test-utils';
import {
  AvailabilityAlertCapReached,
  AvailabilityAlertIneligible,
  AvailabilityAlertSaved,
  myAlertsPath,
} from './AvailabilityAlertOutcomeViews';

const baseAlert: AvailabilityAlertResponse = {
  id: '30000000-0000-4000-8000-000000000001',
  serviceId: '10000000-0000-4000-8000-000000000001',
  preferredResourceId: null,
  criteriaType: 'ONE_TIME_RANGE',
  timezone: 'America/Sao_Paulo',
  acceptableStartAt: '2026-10-20T12:00:00.000Z',
  acceptableEndAt: '2026-10-27T21:00:00.000Z',
  weekdays: null,
  localStartTime: null,
  localEndTime: null,
  durationMinutes: null,
  participantCount: null,
  status: 'ACTIVE',
  expiresAt: '2026-11-05T15:00:00.000Z',
  createdAt: '2026-10-06T15:00:00.000Z',
};

describe('AvailabilityAlertSaved', () => {
  it('confirms the alert, names the service and the e-mail, and says nothing was reserved', () => {
    renderWithIntl(
      <AvailabilityAlertSaved
        slug="acme"
        alert={baseAlert}
        serviceName="Lavagem Simples"
        email="joao@email.com"
      />,
    );

    expect(screen.getByRole('heading', { name: 'Aviso criado' })).toBeInTheDocument();
    expect(screen.getByText('Lavagem Simples')).toBeInTheDocument();
    expect(screen.getByText(/joao@email\.com/)).toBeInTheDocument();
    expect(screen.getByText('Nenhum horário foi reservado.')).toBeInTheDocument();
  });

  it('shows the one-time period in the tenant timezone and the expiry date', () => {
    renderWithIntl(
      <AvailabilityAlertSaved
        slug="acme"
        alert={baseAlert}
        serviceName="Lavagem Simples"
        email="joao@email.com"
      />,
    );

    // 12:00Z is 09:00 in Sao Paulo; 21:00Z is 18:00.
    expect(screen.getByText(/20\/10\/2026 09:00 – 27\/10\/2026 18:00/)).toBeInTheDocument();
    expect(screen.getByText('05/11/2026')).toBeInTheDocument();
  });

  it('summarises a weekly preference with the weekday names and times', () => {
    renderWithIntl(
      <AvailabilityAlertSaved
        slug="acme"
        alert={{
          ...baseAlert,
          criteriaType: 'WEEKLY_PREFERENCE',
          acceptableStartAt: null,
          acceptableEndAt: null,
          weekdays: ['tuesday', 'thursday'],
          localStartTime: '09:00',
          localEndTime: '12:00',
        }}
        serviceName="Lavagem Simples"
        email="joao@email.com"
      />,
    );

    expect(screen.getByText('Ter, Qui, 09:00 – 12:00')).toBeInTheDocument();
  });

  it('offers a single action: back to the site', () => {
    renderWithIntl(
      <AvailabilityAlertSaved
        slug="acme"
        alert={baseAlert}
        serviceName="Lavagem Simples"
        email="joao@email.com"
      />,
    );

    expect(screen.getByTestId('availability-alert-back-to-site')).toHaveAttribute('href', '/acme');
    expect(screen.getAllByRole('link')).toHaveLength(1);
  });
});

describe('AvailabilityAlertCapReached', () => {
  it('explains the cap and points to "Meus avisos"', () => {
    renderWithIntl(<AvailabilityAlertCapReached slug="acme" onBack={vi.fn()} />);

    expect(
      screen.getByRole('heading', { name: 'Você já tem 10 avisos ativos' }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('availability-alert-view-alerts')).toHaveAttribute(
      'href',
      myAlertsPath('acme'),
    );
  });

  it('returns to the form through the Voltar action', async () => {
    const onBack = vi.fn();
    renderWithIntl(<AvailabilityAlertCapReached slug="acme" onBack={onBack} />);

    await userEvent.click(screen.getByRole('button', { name: 'Voltar' }));

    expect(onBack).toHaveBeenCalledOnce();
  });
});

describe('accessibility of the outcome views', () => {
  it('the confirmation has no violations', async () => {
    const { container } = renderWithIntl(
      <AvailabilityAlertSaved
        slug="acme"
        alert={baseAlert}
        serviceName="Lavagem Simples"
        email="joao@email.com"
      />,
    );

    expect(await axe(container)).toHaveNoViolations();
  });

  it('the cap-reached and not-eligible views have no violations', async () => {
    const cap = renderWithIntl(<AvailabilityAlertCapReached slug="acme" onBack={vi.fn()} />);
    expect(await axe(cap.container)).toHaveNoViolations();
    cap.unmount();

    const ineligible = renderWithIntl(<AvailabilityAlertIneligible slug="acme" />);
    expect(await axe(ineligible.container)).toHaveNoViolations();
  });
});

describe('AvailabilityAlertIneligible', () => {
  it('says the service does not support alerts and offers the way back to the site', () => {
    renderWithIntl(<AvailabilityAlertIneligible slug="acme" />);

    expect(
      screen.getByRole('heading', { name: 'Este serviço não aceita avisos' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Voltar ao site' })).toHaveAttribute('href', '/acme');
  });
});

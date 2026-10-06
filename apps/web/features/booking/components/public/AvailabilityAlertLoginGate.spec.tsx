// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { axe } from '@/axe-helper';
import { renderWithIntl } from '@/test-utils';
import { AvailabilityAlertLoginGate } from './AvailabilityAlertLoginGate';

const RETURN_TO =
  '/acme/booking/availability-alert?serviceId=10000000-0000-4000-8000-000000000001&durationMinutes=60';

describe('AvailabilityAlertLoginGate', () => {
  it('asks the visitor to sign in and explains why', () => {
    renderWithIntl(<AvailabilityAlertLoginGate slug="acme" returnTo={RETURN_TO} />);

    expect(screen.getByRole('heading', { name: 'Entre para ser avisado' })).toBeInTheDocument();
    expect(screen.getByText(/O aviso não reserva horário/)).toBeInTheDocument();
  });

  it('sends the visitor to login and back to this same page, query string included', () => {
    renderWithIntl(<AvailabilityAlertLoginGate slug="acme" returnTo={RETURN_TO} />);

    expect(screen.getByTestId('availability-alert-login-cta')).toHaveAttribute(
      'href',
      `/acme/login?returnTo=${encodeURIComponent(RETURN_TO)}`,
    );
  });

  it('keeps the whole query string recoverable from the login link', () => {
    renderWithIntl(<AvailabilityAlertLoginGate slug="acme" returnTo={RETURN_TO} />);

    const href = screen.getByTestId('availability-alert-login-cta').getAttribute('href') ?? '';
    const returnTo = new URL(href, 'http://x').searchParams.get('returnTo');

    expect(returnTo).toBe(RETURN_TO);
  });

  it('offers a way back to the booking flow', () => {
    renderWithIntl(<AvailabilityAlertLoginGate slug="acme" returnTo={RETURN_TO} />);

    expect(screen.getByRole('link', { name: 'Voltar' })).toHaveAttribute('href', '/acme/booking');
  });

  it('has no accessibility violations', async () => {
    const { container } = renderWithIntl(
      <AvailabilityAlertLoginGate slug="acme" returnTo={RETURN_TO} />,
    );

    expect(await axe(container)).toHaveNoViolations();
  });

  it('paints its own background (hotsite full-page component)', () => {
    renderWithIntl(<AvailabilityAlertLoginGate slug="acme" returnTo={RETURN_TO} />);

    // jsdom cannot resolve var() in getComputedStyle, so assert the inline style the component set.
    expect(screen.getByRole('main').getAttribute('style')).toContain(
      'background-color: var(--ba-background)',
    );
  });
});

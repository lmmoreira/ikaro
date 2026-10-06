// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import { AvailabilityAlertEntry } from './AvailabilityAlertEntry';

const HREF = '/acme/booking/availability-alert?serviceId=10000000-0000-4000-8000-000000000001';

describe('AvailabilityAlertEntry', () => {
  it('links to the alert page with the pt-BR label', () => {
    renderWithIntl(<AvailabilityAlertEntry href={HREF} />);

    const button = screen.getByTestId('availability-alert-entry');
    expect(button).toHaveAttribute('href', HREF);
    expect(button).toHaveTextContent('Avise-me quando abrir');
  });

  it('uses the English label in the en locale', () => {
    renderWithIntl(<AvailabilityAlertEntry href={HREF} />, { locale: 'en' });

    expect(screen.getByTestId('availability-alert-entry')).toHaveTextContent(
      'Notify me when a spot opens',
    );
  });

  it('renders nothing when no alert can be offered', () => {
    renderWithIntl(<AvailabilityAlertEntry href={null} />);

    expect(screen.queryByTestId('availability-alert-entry')).not.toBeInTheDocument();
  });

  it('is outlined in the brand colour, not filled', () => {
    renderWithIntl(<AvailabilityAlertEntry href={HREF} />);

    // jsdom cannot resolve var() in getComputedStyle, so assert the inline style the component set.
    const style = screen.getByTestId('availability-alert-entry').getAttribute('style') ?? '';
    expect(style).toContain('border-color: var(--ba-primary)');
    expect(style).toContain('color: var(--ba-primary)');
    expect(style).not.toContain('background');
  });
});

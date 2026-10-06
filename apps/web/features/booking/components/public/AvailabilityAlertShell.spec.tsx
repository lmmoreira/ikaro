// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import { AvailabilityAlertShell } from './AvailabilityAlertShell';

describe('AvailabilityAlertShell', () => {
  it('frames its content with the step indicator and paints the tenant background itself', () => {
    renderWithIntl(
      <AvailabilityAlertShell testId="frame">
        <p>conteúdo</p>
      </AvailabilityAlertShell>,
    );

    expect(screen.getByText('Aviso de disponibilidade')).toBeInTheDocument();
    expect(screen.getByText('conteúdo')).toBeInTheDocument();
    expect(screen.getByTestId('frame')).toBeInTheDocument();
    // jsdom cannot resolve var() in getComputedStyle, so assert the inline style the shell set.
    expect(screen.getByRole('main').getAttribute('style')).toContain(
      'background-color: var(--ba-background)',
    );
  });

  it('uses the English step indicator in the en locale', () => {
    renderWithIntl(
      <AvailabilityAlertShell>
        <p>content</p>
      </AvailabilityAlertShell>,
      { locale: 'en' },
    );

    expect(screen.getByText('Availability alert')).toBeInTheDocument();
  });
});

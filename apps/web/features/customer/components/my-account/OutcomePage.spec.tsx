// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { OutcomePage } from './OutcomePage';

function renderPage(withSecondary: boolean): void {
  render(
    <OutcomePage
      testId="outcome"
      message={<p role="alert">Fora do prazo</p>}
      primary={{ label: 'Voltar ao agendamento', href: '/vitta/my-account/bookings/b1' }}
      secondary={
        withSecondary
          ? { label: 'Contato via WhatsApp', href: 'https://wa.me/5511999990000', external: true }
          : undefined
      }
    >
      <p>Lavagem Completa</p>
    </OutcomePage>,
  );
}

describe('OutcomePage', () => {
  it('puts the message and the cards in the column', () => {
    renderPage(true);

    expect(screen.getByTestId('outcome')).toHaveTextContent('Fora do prazo');
    expect(screen.getByText('Lavagem Completa')).toBeTruthy();
  });

  it('offers both links in the sticky pane and in the mobile bar', () => {
    renderPage(true);

    for (const place of ['action-pane-desktop', 'action-pane-mobile']) {
      const pane = within(screen.getByTestId(place));
      expect(pane.getByRole('link', { name: 'Voltar ao agendamento' }).getAttribute('href')).toBe(
        '/vitta/my-account/bookings/b1',
      );
      expect(pane.getByRole('link', { name: 'Contato via WhatsApp' })).toBeTruthy();
    }
  });

  it('opens an external link in a new tab without leaking the opener', () => {
    renderPage(true);

    const link = within(screen.getByTestId('action-pane-desktop')).getByRole('link', {
      name: 'Contato via WhatsApp',
    });
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('renders only the primary link when there is no secondary one', () => {
    renderPage(false);

    expect(screen.queryByRole('link', { name: 'Contato via WhatsApp' })).toBeNull();
    expect(
      within(screen.getByTestId('action-pane-mobile')).getByRole('link', {
        name: 'Voltar ao agendamento',
      }),
    ).toBeTruthy();
  });

  it('draws no message box of its own in the pane', () => {
    renderPage(true);

    expect(within(screen.getByTestId('action-pane-desktop')).queryByRole('alert')).toBeNull();
  });
});

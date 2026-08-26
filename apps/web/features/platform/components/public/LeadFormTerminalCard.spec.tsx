// @vitest-environment jsdom
import { renderWithIntl } from '@/test-utils';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { axe } from '@/axe-helper';
import { LeadFormTerminalCard } from './LeadFormTerminalCard';

describe('LeadFormTerminalCard', () => {
  it('renders the icon, title, body, and a "back to site" link', () => {
    renderWithIntl(
      <LeadFormTerminalCard
        icon="⏳"
        title="Muitas solicitações no momento"
        body="Tente novamente mais tarde."
        slug="lavacar-beloauto"
      />,
    );

    expect(screen.getByText('Muitas solicitações no momento')).toBeInTheDocument();
    expect(screen.getByText('Voltar ao site')).toHaveAttribute('href', '/lavacar-beloauto');
    expect(screen.queryByTestId('lead-form-retry')).not.toBeInTheDocument();
  });

  it('renders a retry button and calls onRetry when both retryLabel and onRetry are provided', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    renderWithIntl(
      <LeadFormTerminalCard
        icon="⚠"
        title="Não foi possível enviar"
        body="Tente novamente."
        slug="lavacar-beloauto"
        retryLabel="Tentar novamente"
        onRetry={onRetry}
      />,
    );

    await user.click(screen.getByTestId('lead-form-retry'));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('has no accessibility violations', async () => {
    const { container } = renderWithIntl(
      <LeadFormTerminalCard
        icon="⚠"
        title="Não foi possível enviar"
        body="Tente novamente."
        slug="lavacar-beloauto"
        retryLabel="Tentar novamente"
        onRetry={vi.fn()}
      />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});

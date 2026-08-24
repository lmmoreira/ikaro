// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  EmptyState,
  EntryIcon,
  HistoryTabs,
  LoyaltyHistoryRow,
  formatShortDateLabel,
} from './LoyaltyHistoryHelpers';

describe('formatShortDateLabel', () => {
  it('formats an ISO date as a short pt-BR date label', () => {
    expect(formatShortDateLabel('2026-07-10T00:00:00.000Z', 'pt-BR')).toBe('10 de jul. de 2026');
  });

  it('formats the same date differently for a different locale', () => {
    expect(formatShortDateLabel('2026-07-10T00:00:00.000Z', 'en')).toBe('Jul 10, 2026');
  });
});

describe('HistoryTabs', () => {
  it('highlights the active tab and calls onChange when the other tab is clicked', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <HistoryTabs
        activeTab="entries"
        onChange={onChange}
        entriesLabel="Histórico de ganhos"
        redemptionsLabel="Resgates"
      />,
    );

    const entriesTab = screen.getByRole('button', { name: 'Histórico de ganhos' });
    const redemptionsTab = screen.getByRole('button', { name: 'Resgates' });
    expect(entriesTab.className).toContain('text-blue-600');
    expect(redemptionsTab.className).toContain('text-gray-400');

    await user.click(redemptionsTab);
    expect(onChange).toHaveBeenCalledWith('redemptions');
  });
});

describe('EntryIcon', () => {
  it('renders an emerald icon when not expired', () => {
    const { container } = render(<EntryIcon expired={false} />);
    expect(container.firstElementChild?.className).toContain('bg-emerald-100');
  });

  it('renders a gray icon when expired', () => {
    const { container } = render(<EntryIcon expired />);
    expect(container.firstElementChild?.className).toContain('bg-gray-100');
  });
});

describe('EmptyState', () => {
  it('renders the icon, title, and body', () => {
    render(<EmptyState icon={<span data-testid="empty-icon" />} title="Vazio" body="Nada aqui" />);

    expect(screen.getByTestId('empty-icon')).toBeInTheDocument();
    expect(screen.getByText('Vazio')).toBeInTheDocument();
    expect(screen.getByText('Nada aqui')).toBeInTheDocument();
  });
});

describe('LoyaltyHistoryRow', () => {
  it('renders icon, title, meta, and points', () => {
    render(
      <LoyaltyHistoryRow
        icon={<span data-testid="row-icon" />}
        title={<span>Lavagem Simples</span>}
        meta={<span>10 jul.</span>}
        points={<span>+20 pts</span>}
      />,
    );

    expect(screen.getByTestId('row-icon')).toBeInTheDocument();
    expect(screen.getByText('Lavagem Simples')).toBeInTheDocument();
    expect(screen.getByText('10 jul.')).toBeInTheDocument();
    expect(screen.getByText('+20 pts')).toBeInTheDocument();
  });

  it('renders the optional link when provided', () => {
    render(
      <LoyaltyHistoryRow
        icon={<span />}
        title={<span>title</span>}
        meta={<span>meta</span>}
        points={<span>points</span>}
        link={
          // eslint-disable-next-line @next/next/no-html-link-for-pages -- fixture supplies the link node consumed by the presentational component
          <a href="/booking/1">Ver agendamento</a>
        }
      />,
    );

    expect(screen.getByRole('link', { name: 'Ver agendamento' })).toHaveAttribute(
      'href',
      '/booking/1',
    );
  });

  it('renders no link when omitted', () => {
    render(
      <LoyaltyHistoryRow
        icon={<span />}
        title={<span>title</span>}
        meta={<span>meta</span>}
        points={<span>points</span>}
      />,
    );

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});

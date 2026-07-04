// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type {
  CustomerLoyaltyBalanceResponse,
  CustomerLoyaltyEntriesResponse,
  CustomerLoyaltyRedemptionsResponse,
} from '@ikaro/types';
import { LoyaltyPage } from './LoyaltyPage';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    const translations: Record<string, string> = {
      title: 'Minha Fidelidade',
      pointsActiveLabel: 'pontos ativos',
      expiryWarning: '⚠ {points} pts expiram em {date}',
      conversionRow: '{rate} pts = {unit} · Valor total: {total}',
      emptyTitle: 'Nenhum ponto acumulado ainda',
      emptyBody: 'Complete um agendamento para começar a acumular pontos e trocar por descontos.',
      emptyCta: 'Agendar agora',
      tabEntries: 'Histórico de ganhos',
      tabRedemptions: 'Resgates',
      expiredBadge: 'Expirado',
      noRedemptions: 'Nenhum resgate realizado ainda',
      redemptionLabel: 'Resgate — {reference}',
      redemptionLabelGeneric: 'Resgate',
      savingsLabel: 'Economia: {amount}',
    };
    let value = translations[key] ?? key;
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        value = value.replace(`{${k}}`, String(v));
      }
    }
    return value;
  },
}));

vi.mock('@/shared/lib/formatting/use-formatting', () => ({
  useFormatting: () => ({
    formatMoney: (amount: number) => `R$ ${amount.toFixed(2)}`,
    formatDate: (date: Date) => date.toISOString().slice(0, 10),
  }),
}));

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

function makeBalance(
  overrides: Partial<CustomerLoyaltyBalanceResponse> = {},
): CustomerLoyaltyBalanceResponse {
  return {
    currentPoints: 120,
    nextExpiryDate: '2026-08-15T00:00:00.000Z',
    nextExpiryPoints: 12,
    conversionRate: 10,
    ...overrides,
  };
}

function makeEntries(
  overrides: Partial<CustomerLoyaltyEntriesResponse> = {},
): CustomerLoyaltyEntriesResponse {
  return {
    items: [
      {
        entryId: 'e1',
        serviceName: 'Cristalização de Pintura',
        pointsEarned: 20,
        earnedAt: '2026-06-05T00:00:00.000Z',
        expiresAt: '2026-12-05T00:00:00.000Z',
        expired: false,
      },
      {
        entryId: 'e2',
        serviceName: 'Lavagem Simples',
        pointsEarned: 5,
        earnedAt: '2026-02-10T00:00:00.000Z',
        expiresAt: '2026-08-10T00:00:00.000Z',
        expired: true,
      },
    ],
    total: 2,
    page: 1,
    limit: 50,
    ...overrides,
  };
}

function makeRedemptions(
  overrides: Partial<CustomerLoyaltyRedemptionsResponse> = {},
): CustomerLoyaltyRedemptionsResponse {
  return {
    items: [
      {
        redemptionId: 'r1',
        pointsUsed: 85,
        amountSaved: 'R$ 8,50',
        redeemedAt: '2026-05-18T00:00:00.000Z',
        bookingReference: 'Lavagem Completa',
      },
    ],
    total: 1,
    page: 1,
    limit: 50,
    ...overrides,
  };
}

describe('LoyaltyPage', () => {
  it('renders the balance card with currentPoints', () => {
    render(
      <LoyaltyPage
        balance={makeBalance()}
        entries={makeEntries()}
        redemptions={makeRedemptions()}
        tenantSlug="lavacar-bh"
      />,
    );

    expect(screen.getByText('120')).toBeInTheDocument();
    expect(screen.getByText('pontos ativos')).toBeInTheDocument();
  });

  it('shows the expiry strip when nextExpiryDate is set', () => {
    render(
      <LoyaltyPage
        balance={makeBalance()}
        entries={makeEntries()}
        redemptions={makeRedemptions()}
        tenantSlug="lavacar-bh"
      />,
    );

    expect(screen.getByText('⚠ 12 pts expiram em 2026-08-15')).toBeInTheDocument();
  });

  it('hides the expiry strip when nextExpiryDate is null', () => {
    render(
      <LoyaltyPage
        balance={makeBalance({ nextExpiryDate: null, nextExpiryPoints: null })}
        entries={makeEntries()}
        redemptions={makeRedemptions()}
        tenantSlug="lavacar-bh"
      />,
    );

    expect(screen.queryByText(/expiram em/)).not.toBeInTheDocument();
  });

  it('shows the conversion row with a dynamic rate and total when conversionRate > 0', () => {
    render(
      <LoyaltyPage
        balance={makeBalance({ conversionRate: 10, currentPoints: 120 })}
        entries={makeEntries()}
        redemptions={makeRedemptions()}
        tenantSlug="lavacar-bh"
      />,
    );

    expect(screen.getByText('10 pts = R$ 1.00 · Valor total: R$ 12.00')).toBeInTheDocument();
  });

  it('hides the conversion row when conversionRate is 0', () => {
    render(
      <LoyaltyPage
        balance={makeBalance({ conversionRate: 0 })}
        entries={makeEntries()}
        redemptions={makeRedemptions()}
        tenantSlug="lavacar-bh"
      />,
    );

    expect(screen.queryByText(/pts = R\$/)).not.toBeInTheDocument();
  });

  it('Ganhos tab is shown by default with service name, date and green points', () => {
    render(
      <LoyaltyPage
        balance={makeBalance()}
        entries={makeEntries()}
        redemptions={makeRedemptions()}
        tenantSlug="lavacar-bh"
      />,
    );

    expect(screen.getByText('Cristalização de Pintura')).toBeInTheDocument();
    expect(screen.getByText('+20 pts')).toBeInTheDocument();
  });

  it('fades expired entries and shows the "Expirado" badge', () => {
    render(
      <LoyaltyPage
        balance={makeBalance()}
        entries={makeEntries()}
        redemptions={makeRedemptions()}
        tenantSlug="lavacar-bh"
      />,
    );

    expect(screen.getByText('Expirado')).toBeInTheDocument();
    const expiredRow = screen.getByText('Lavagem Simples').closest('li');
    expect(expiredRow?.className).toContain('opacity-40');
  });

  it('switches to the Resgates tab and shows redemptions with savings', async () => {
    const user = userEvent.setup();
    render(
      <LoyaltyPage
        balance={makeBalance()}
        entries={makeEntries()}
        redemptions={makeRedemptions()}
        tenantSlug="lavacar-bh"
      />,
    );

    await user.click(screen.getByRole('tab', { name: 'Resgates' }));

    expect(screen.getByText('Resgate — Lavagem Completa')).toBeInTheDocument();
    expect(screen.getByText('Economia: R$ 8,50')).toBeInTheDocument();
    expect(screen.getByText('−85 pts')).toBeInTheDocument();
  });

  it('shows the empty-redemptions message when there are none', async () => {
    const user = userEvent.setup();
    render(
      <LoyaltyPage
        balance={makeBalance()}
        entries={makeEntries()}
        redemptions={makeRedemptions({ items: [], total: 0 })}
        tenantSlug="lavacar-bh"
      />,
    );

    await user.click(screen.getByRole('tab', { name: 'Resgates' }));

    expect(screen.getByText('Nenhum resgate realizado ainda')).toBeInTheDocument();
  });

  it('shows a generic redemption label when bookingReference is null', async () => {
    const user = userEvent.setup();
    render(
      <LoyaltyPage
        balance={makeBalance()}
        entries={makeEntries()}
        redemptions={makeRedemptions({
          items: [
            {
              redemptionId: 'r2',
              pointsUsed: 50,
              amountSaved: 'R$ 5,00',
              redeemedAt: '2026-05-01T00:00:00.000Z',
              bookingReference: null,
            },
          ],
        })}
        tenantSlug="lavacar-bh"
      />,
    );

    await user.click(screen.getByRole('tab', { name: 'Resgates' }));

    expect(screen.getByText('Resgate')).toBeInTheDocument();
  });

  it('shows the empty state when both balance and entries are zero', () => {
    render(
      <LoyaltyPage
        balance={makeBalance({ currentPoints: 0, nextExpiryDate: null, nextExpiryPoints: null })}
        entries={makeEntries({ items: [], total: 0 })}
        redemptions={makeRedemptions({ items: [], total: 0 })}
        tenantSlug="lavacar-bh"
      />,
    );

    expect(screen.getByText('Nenhum ponto acumulado ainda')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Agendar agora' })).toHaveAttribute(
      'href',
      '/lavacar-bh/booking',
    );
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
  });
});

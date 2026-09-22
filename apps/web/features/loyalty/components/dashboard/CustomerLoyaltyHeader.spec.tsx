// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { useTranslations } from 'next-intl';
import type { CustomerProfileResponse, EnrichedLoyaltyBalanceResponse } from '@ikaro/types';
import { CustomerLoyaltyHeader } from './CustomerLoyaltyHeader';

// CustomerLoyaltyHeader takes `t` as a plain prop (the caller already resolved
// useTranslations('dashboard.loyaltyPage')) rather than calling the hook itself, so a fake `t`
// mirroring the real pt-BR strings (packages/i18n/locales/pt-BR/web.json) is enough — no
// NextIntlClientProvider needed.
function fakeTFn(key: string, values?: Record<string, string | number>): string {
  const templates: Record<string, string> = {
    balanceLabelActive: 'pontos ativos',
    balanceLabelEmpty: 'pontos acumulados',
    balanceExpiryLine: '{count} pts expiram em {date}',
    balanceRateLine: '{pointsPerCurrencyUnit} pts = {price} · {totalLabel} {total}',
    balanceTotalLabel: 'Valor total:',
  };
  const template = templates[key] ?? key;
  if (!values) return template;
  return Object.entries(values).reduce(
    (acc, [name, value]) => acc.replaceAll(`{${name}}`, String(value)),
    template,
  );
}
const fakeT = fakeTFn as unknown as ReturnType<typeof useTranslations>;

function makeCustomer(overrides?: Partial<CustomerProfileResponse>): CustomerProfileResponse {
  return {
    customerId: 'c-1',
    email: 'joao@example.com',
    name: 'João Silva',
    phone: null,
    defaultAddress: null,
    ...overrides,
  };
}

function makeBalance(
  overrides?: Partial<EnrichedLoyaltyBalanceResponse>,
): EnrichedLoyaltyBalanceResponse {
  return {
    currentPoints: 120,
    nextExpiryDate: null,
    nextExpiryPoints: null,
    conversionRate: 100,
    ...overrides,
  };
}

describe('CustomerLoyaltyHeader', () => {
  it('renders the customer name and email with initials', () => {
    render(
      <CustomerLoyaltyHeader
        customer={makeCustomer()}
        balance={makeBalance()}
        initialPoints={120}
        hasPoints
        totalValue={1.2}
        nextExpiryLabel={null}
        balanceCardClassName="bg-blue-600"
        formatMoney={(n) => `R$ ${n.toFixed(2)}`}
        t={fakeT}
      />,
    );

    expect(screen.getByText('João Silva')).toBeInTheDocument();
    expect(screen.getByText('joao@example.com')).toBeInTheDocument();
    expect(screen.getByText('JS')).toBeInTheDocument();
  });

  it('renders the active balance label and points when hasPoints is true', () => {
    render(
      <CustomerLoyaltyHeader
        customer={makeCustomer()}
        balance={makeBalance()}
        initialPoints={120}
        hasPoints
        totalValue={1.2}
        nextExpiryLabel={null}
        balanceCardClassName=""
        formatMoney={(n) => `R$ ${n.toFixed(2)}`}
        t={fakeT}
      />,
    );

    expect(screen.getByText('120')).toBeInTheDocument();
    expect(screen.getByTestId('loyalty-balance-label')).toHaveTextContent('pontos ativos');
  });

  it('renders the empty balance label when hasPoints is false', () => {
    render(
      <CustomerLoyaltyHeader
        customer={makeCustomer()}
        balance={makeBalance({ currentPoints: 0 })}
        initialPoints={0}
        hasPoints={false}
        totalValue={0}
        nextExpiryLabel={null}
        balanceCardClassName=""
        formatMoney={(n) => `R$ ${n.toFixed(2)}`}
        t={fakeT}
      />,
    );

    expect(screen.getByTestId('loyalty-balance-label')).toHaveTextContent('pontos acumulados');
  });

  it('renders the expiry warning line when hasPoints, nextExpiryLabel, and nextExpiryPoints are set', () => {
    render(
      <CustomerLoyaltyHeader
        customer={makeCustomer()}
        balance={makeBalance({ nextExpiryPoints: 30 })}
        initialPoints={120}
        hasPoints
        totalValue={1.2}
        nextExpiryLabel="10/07/2026"
        balanceCardClassName=""
        formatMoney={(n) => `R$ ${n.toFixed(2)}`}
        t={fakeT}
      />,
    );

    expect(screen.getByText('30 pts expiram em 10/07/2026')).toBeInTheDocument();
  });

  it('renders no expiry line when nextExpiryLabel is null', () => {
    render(
      <CustomerLoyaltyHeader
        customer={makeCustomer()}
        balance={makeBalance({ nextExpiryPoints: 30 })}
        initialPoints={120}
        hasPoints
        totalValue={1.2}
        nextExpiryLabel={null}
        balanceCardClassName=""
        formatMoney={(n) => `R$ ${n.toFixed(2)}`}
        t={fakeT}
      />,
    );

    expect(screen.queryByText(/pts expiram em/)).not.toBeInTheDocument();
  });

  it('renders the conversion rate line when hasPoints and conversionRate > 0', () => {
    render(
      <CustomerLoyaltyHeader
        customer={makeCustomer()}
        balance={makeBalance({ conversionRate: 100 })}
        initialPoints={120}
        hasPoints
        totalValue={1.2}
        nextExpiryLabel={null}
        balanceCardClassName=""
        formatMoney={(n) => `R$ ${n.toFixed(2)}`}
        t={fakeT}
      />,
    );

    expect(screen.getByText('100 pts = R$ 1.00 · Valor total: R$ 1.20')).toBeInTheDocument();
  });

  it('renders no conversion rate line when conversionRate is 0 (redemption disabled)', () => {
    render(
      <CustomerLoyaltyHeader
        customer={makeCustomer()}
        balance={makeBalance({ conversionRate: 0 })}
        initialPoints={120}
        hasPoints
        totalValue={0}
        nextExpiryLabel={null}
        balanceCardClassName=""
        formatMoney={(n) => `R$ ${n.toFixed(2)}`}
        t={fakeT}
      />,
    );

    expect(screen.queryByText(/pts = /)).not.toBeInTheDocument();
  });
});

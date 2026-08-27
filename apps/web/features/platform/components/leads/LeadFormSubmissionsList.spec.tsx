// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { LeadFormSubmissionListItem } from '@ikaro/types';
import { renderWithIntl } from '@/test-utils';
import { LeadFormSubmissionsList } from './LeadFormSubmissionsList';

function buildItem(overrides?: Partial<LeadFormSubmissionListItem>): LeadFormSubmissionListItem {
  return {
    id: 'sub-1',
    name: 'Carlos Mendes',
    email: 'carlos.mendes@email.com',
    phone: '(11) 98888-7777',
    submittedAt: '2026-08-21T14:32:00.000Z',
    ...overrides,
  };
}

describe('LeadFormSubmissionsList', () => {
  it('renders the empty state with a CTA back to the hotsite editor when total is 0', () => {
    renderWithIntl(<LeadFormSubmissionsList items={[]} page={1} pageSize={20} total={0} />);

    expect(screen.getByText('Nenhum envio ainda')).toBeInTheDocument();
    const cta = screen.getByText('Configurar o Lead Form').closest('a');
    expect(cta).toHaveAttribute('href', '/dashboard/hotsite');
  });

  it('renders one row per submission with name, email, phone, and a link to the detail page', () => {
    const items = [
      buildItem({ id: 'sub-1', name: 'Carlos Mendes' }),
      buildItem({ id: 'sub-2', name: 'Maria Fernanda Costa', email: 'maria@email.com' }),
    ];
    renderWithIntl(<LeadFormSubmissionsList items={items} page={1} pageSize={20} total={2} />);

    expect(screen.getByText('Carlos Mendes')).toBeInTheDocument();
    expect(screen.getByText('Maria Fernanda Costa')).toBeInTheDocument();
    const row = screen.getByText('Carlos Mendes').closest('a');
    expect(row).toHaveAttribute('href', '/dashboard/leads/sub-1');
  });

  it('renders the pluralized total count', () => {
    renderWithIntl(
      <LeadFormSubmissionsList items={[buildItem()]} page={1} pageSize={20} total={42} />,
    );

    expect(screen.getByTestId('leads-total-count')).toHaveTextContent('42 envios recebidos');
  });

  it('uses the singular form for exactly one submission', () => {
    renderWithIntl(
      <LeadFormSubmissionsList items={[buildItem()]} page={1} pageSize={20} total={1} />,
    );

    expect(screen.getByTestId('leads-total-count')).toHaveTextContent('1 envio recebido');
  });

  it('does not render pagination controls when everything fits on one page', () => {
    renderWithIntl(
      <LeadFormSubmissionsList items={[buildItem()]} page={1} pageSize={20} total={1} />,
    );

    expect(screen.queryByLabelText('Paginação')).not.toBeInTheDocument();
  });

  it('renders numbered pagination links and disables prev/next at the boundaries', () => {
    const items = Array.from({ length: 20 }, (_, i) => buildItem({ id: `sub-${i}` }));
    renderWithIntl(<LeadFormSubmissionsList items={items} page={1} pageSize={20} total={45} />);

    expect(screen.getByText('1')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByText('2')).toHaveAttribute('href', '/dashboard/leads?page=2');
    expect(screen.getByText('3')).toHaveAttribute('href', '/dashboard/leads?page=3');
    expect(screen.getByLabelText('Página anterior')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByLabelText('Próxima página')).toHaveAttribute('aria-disabled', 'false');
  });

  it('links page 1 without a query string', () => {
    const items = Array.from({ length: 20 }, (_, i) => buildItem({ id: `sub-${i}` }));
    renderWithIntl(<LeadFormSubmissionsList items={items} page={2} pageSize={20} total={45} />);

    expect(screen.getByText('1')).toHaveAttribute('href', '/dashboard/leads');
    expect(screen.getByLabelText('Página anterior')).toHaveAttribute('href', '/dashboard/leads');
  });

  it('formats submittedAt using the tenant formatting context', () => {
    renderWithIntl(
      <LeadFormSubmissionsList items={[buildItem()]} page={1} pageSize={20} total={1} />,
    );

    // Default pt-BR formatting context: America/Sao_Paulo, DD/MM/YYYY, 24h.
    expect(screen.getByText(/21\/08\/2026, 11:32/)).toBeInTheDocument();
  });
});

// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { LeadFormSubmissionListItem } from '@ikaro/types';
import { renderWithIntl } from '@/test-utils';
import type { LeadFormSearchQuery } from '@/features/platform/model/lead-form-search';
import { LeadFormSubmissionsList } from './LeadFormSubmissionsList';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

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

const NO_QUERY: LeadFormSearchQuery = {};

describe('LeadFormSubmissionsList', () => {
  it('renders the "no submissions ever" empty state (no active query) without a search panel', () => {
    renderWithIntl(
      <LeadFormSubmissionsList
        items={[]}
        page={1}
        pageSize={20}
        total={0}
        searchQuery={NO_QUERY}
        filterOptionLabels={[]}
      />,
    );

    expect(screen.getByText('Nenhum envio ainda')).toBeInTheDocument();
    const cta = screen.getByText('Configurar o Lead Form').closest('a');
    expect(cta).toHaveAttribute('href', '/dashboard/hotsite');
    expect(screen.queryByTestId('leads-search-panel')).not.toBeInTheDocument();
  });

  it('renders one row per submission with name, email, phone, and a link to the detail page', () => {
    const items = [
      buildItem({ id: 'sub-1', name: 'Carlos Mendes' }),
      buildItem({ id: 'sub-2', name: 'Maria Fernanda Costa', email: 'maria@email.com' }),
    ];
    renderWithIntl(
      <LeadFormSubmissionsList
        items={items}
        page={1}
        pageSize={20}
        total={2}
        searchQuery={NO_QUERY}
        filterOptionLabels={[]}
      />,
    );

    expect(screen.getByText('Carlos Mendes')).toBeInTheDocument();
    expect(screen.getByText('Maria Fernanda Costa')).toBeInTheDocument();
    const row = screen.getByText('Carlos Mendes').closest('a');
    expect(row).toHaveAttribute('href', '/dashboard/leads/sub-1');
  });

  it('renders the search panel above the list', () => {
    renderWithIntl(
      <LeadFormSubmissionsList
        items={[buildItem()]}
        page={1}
        pageSize={20}
        total={1}
        searchQuery={NO_QUERY}
        filterOptionLabels={[]}
      />,
    );

    expect(screen.getByTestId('leads-search-panel')).toBeInTheDocument();
  });

  it('renders the pluralized total count', () => {
    renderWithIntl(
      <LeadFormSubmissionsList
        items={[buildItem()]}
        page={1}
        pageSize={20}
        total={42}
        searchQuery={NO_QUERY}
        filterOptionLabels={[]}
      />,
    );

    expect(screen.getByTestId('leads-total-count')).toHaveTextContent('42 envios recebidos');
  });

  it('uses the singular form for exactly one submission', () => {
    renderWithIntl(
      <LeadFormSubmissionsList
        items={[buildItem()]}
        page={1}
        pageSize={20}
        total={1}
        searchQuery={NO_QUERY}
        filterOptionLabels={[]}
      />,
    );

    expect(screen.getByTestId('leads-total-count')).toHaveTextContent('1 envio recebido');
  });

  it('does not render pagination controls when everything fits on one page', () => {
    renderWithIntl(
      <LeadFormSubmissionsList
        items={[buildItem()]}
        page={1}
        pageSize={20}
        total={1}
        searchQuery={NO_QUERY}
        filterOptionLabels={[]}
      />,
    );

    expect(screen.queryByLabelText('Paginação')).not.toBeInTheDocument();
  });

  it('renders numbered pagination links and disables prev/next at the boundaries', () => {
    const items = Array.from({ length: 20 }, (_, i) => buildItem({ id: `sub-${i}` }));
    renderWithIntl(
      <LeadFormSubmissionsList
        items={items}
        page={1}
        pageSize={20}
        total={45}
        searchQuery={NO_QUERY}
        filterOptionLabels={[]}
      />,
    );

    expect(screen.getByText('1')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByText('2')).toHaveAttribute('href', '/dashboard/leads?page=2');
    expect(screen.getByText('3')).toHaveAttribute('href', '/dashboard/leads?page=3');
    expect(screen.getByLabelText('Página anterior')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByLabelText('Próxima página')).toHaveAttribute('aria-disabled', 'false');
  });

  it('links page 1 without a query string', () => {
    const items = Array.from({ length: 20 }, (_, i) => buildItem({ id: `sub-${i}` }));
    renderWithIntl(
      <LeadFormSubmissionsList
        items={items}
        page={2}
        pageSize={20}
        total={45}
        searchQuery={NO_QUERY}
        filterOptionLabels={[]}
      />,
    );

    expect(screen.getByText('1')).toHaveAttribute('href', '/dashboard/leads');
    expect(screen.getByLabelText('Página anterior')).toHaveAttribute('href', '/dashboard/leads');
  });

  it('preserves the active search term in pagination links', () => {
    const items = Array.from({ length: 20 }, (_, i) => buildItem({ id: `sub-${i}` }));
    renderWithIntl(
      <LeadFormSubmissionsList
        items={items}
        page={1}
        pageSize={20}
        total={45}
        searchQuery={{ search: 'carlos' }}
        filterOptionLabels={[]}
      />,
    );

    expect(screen.getByText('2')).toHaveAttribute('href', '/dashboard/leads?search=carlos&page=2');
  });

  it('renders a bounded window with ellipses instead of one link per page for a large total', () => {
    // 24 months retention x up to 1,000 submissions/day can produce hundreds of pages — the
    // rendered link count must stay bounded regardless of totalPages (Codex PR #435 review).
    const items = Array.from({ length: 20 }, (_, i) => buildItem({ id: `sub-${i}` }));
    renderWithIntl(
      <LeadFormSubmissionsList
        items={items}
        page={25}
        pageSize={20}
        total={900}
        searchQuery={NO_QUERY}
        filterOptionLabels={[]}
      />,
    );

    // totalPages = 45; window around page 25 = {1, 23, 24, 25, 26, 27, 45} + 2 ellipses.
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('23')).toBeInTheDocument();
    expect(screen.getByText('24')).toBeInTheDocument();
    expect(screen.getByText('25')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByText('26')).toBeInTheDocument();
    expect(screen.getByText('27')).toBeInTheDocument();
    expect(screen.getByText('45')).toBeInTheDocument();
    expect(screen.queryByText('2')).not.toBeInTheDocument();
    expect(screen.queryByText('44')).not.toBeInTheDocument();
    expect(screen.getAllByText('…')).toHaveLength(2);
  });

  it('formats submittedAt using the tenant formatting context', () => {
    renderWithIntl(
      <LeadFormSubmissionsList
        items={[buildItem()]}
        page={1}
        pageSize={20}
        total={1}
        searchQuery={NO_QUERY}
        filterOptionLabels={[]}
      />,
    );

    // Default pt-BR formatting context: America/Sao_Paulo, DD/MM/YYYY, 24h.
    expect(screen.getByText(/21\/08\/2026, 11:32/)).toBeInTheDocument();
  });

  describe('zero-match state (UC-041 A3)', () => {
    it('shows the distinct "no results" copy for a basic search term, not the "no submissions" state', () => {
      renderWithIntl(
        <LeadFormSubmissionsList
          items={[]}
          page={1}
          pageSize={20}
          total={0}
          searchQuery={{ search: 'joao@gmail' }}
          filterOptionLabels={[]}
        />,
      );

      expect(screen.getByTestId('leads-no-results')).toHaveTextContent(
        'Nenhum resultado para "joao@gmail"',
      );
      expect(screen.queryByText('Nenhum envio ainda')).not.toBeInTheDocument();
      expect(screen.getByTestId('leads-search-panel')).toBeInTheDocument();
    });

    it('shows the generic filters copy for a zero-match advanced search', () => {
      renderWithIntl(
        <LeadFormSubmissionsList
          items={[]}
          page={1}
          pageSize={20}
          total={0}
          searchQuery={{ filters: [{ questionLabel: 'Estado civil', value: 'casado' }] }}
          filterOptionLabels={['Estado civil']}
        />,
      );

      expect(screen.getByTestId('leads-no-results')).toHaveTextContent(
        'Nenhum resultado para os filtros aplicados',
      );
    });

    it('shows the generic date-range copy when only a date range is active with no term', () => {
      renderWithIntl(
        <LeadFormSubmissionsList
          items={[]}
          page={1}
          pageSize={20}
          total={0}
          searchQuery={{ submittedFrom: '2026-08-01', submittedTo: '2026-08-15' }}
          filterOptionLabels={[]}
        />,
      );

      expect(screen.getByTestId('leads-no-results')).toHaveTextContent(
        'Nenhum resultado para o período selecionado',
      );
    });

    it('"Limpar busca" links back to the fully unfiltered list', () => {
      renderWithIntl(
        <LeadFormSubmissionsList
          items={[]}
          page={1}
          pageSize={20}
          total={0}
          searchQuery={{ search: 'joao@gmail' }}
          filterOptionLabels={[]}
        />,
      );

      const clearLink = screen.getByText('Limpar busca').closest('a');
      expect(clearLink).toHaveAttribute('href', '/dashboard/leads');
    });
  });
});

// @vitest-environment jsdom
import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import { CustomerSearchPanel } from './CustomerSearchPanel';

const search = vi.hoisted(() => ({
  term: '',
  tooShort: false,
  items: [] as unknown[],
  isLoading: false,
  isError: false,
  retry: vi.fn(),
}));
const useCustomerSearch = vi.hoisted(() => vi.fn());

vi.mock('@/features/booking/hooks/useCustomerSearch', () => ({
  MIN_CUSTOMER_SEARCH_LENGTH: 5,
  useCustomerSearch,
}));

const ANA = { customerId: 'c-1', name: 'Ana Costa', email: 'ana@x.com', phone: '+5531999991111' };
const BRUNO = { customerId: 'c-2', name: 'Bruno Lima', email: 'bruno@x.com', phone: null };

beforeEach(() => {
  Object.assign(search, {
    term: '',
    tooShort: false,
    items: [ANA, BRUNO],
    isLoading: false,
    isError: false,
  });
  search.retry.mockReset();
  useCustomerSearch.mockReset();
  useCustomerSearch.mockReturnValue(search);
});

describe('CustomerSearchPanel', () => {
  it('lists customers with e-mail and phone, and marks the picked one', () => {
    renderWithIntl(<CustomerSearchPanel selectedId="c-1" onSelect={vi.fn()} />);

    const rows = screen.getAllByTestId('customer-row');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('Ana Costa');
    expect(rows[0]).toHaveTextContent('ana@x.com · +5531999991111');
    expect(rows[0]!.querySelector('input')).toBeChecked();
    expect(rows[1]!.querySelector('input')).not.toBeChecked();
  });

  it('says "sem telefone" for a customer with no phone', () => {
    renderWithIntl(<CustomerSearchPanel selectedId={null} onSelect={vi.fn()} />);

    expect(screen.getAllByTestId('customer-row')[1]).toHaveTextContent('sem telefone');
  });

  it('reports the picked customer’s id', async () => {
    const onSelect = vi.fn();
    renderWithIntl(<CustomerSearchPanel selectedId={null} onSelect={onSelect} />);

    await userEvent.click(screen.getAllByTestId('customer-row')[1]!);

    expect(onSelect).toHaveBeenCalledWith('c-2');
  });

  it('searches as staff type', () => {
    renderWithIntl(<CustomerSearchPanel selectedId={null} onSelect={vi.fn()} />);

    fireEvent.change(screen.getByTestId('customer-search'), { target: { value: 'ana@x' } });

    expect(useCustomerSearch).toHaveBeenLastCalledWith('ana@x');
  });

  it('heads a search "Resultados" and the plain list "Clientes"', () => {
    const { unmount } = renderWithIntl(
      <CustomerSearchPanel selectedId={null} onSelect={vi.fn()} />,
    );
    expect(screen.getByText('Clientes')).toBeInTheDocument();
    unmount();

    search.term = 'marin';
    renderWithIntl(<CustomerSearchPanel selectedId={null} onSelect={vi.fn()} />);
    expect(screen.getByText('Resultados')).toBeInTheDocument();
  });

  it('points to Novo contato when the tenant has no customers at all', () => {
    search.items = [];
    renderWithIntl(<CustomerSearchPanel selectedId={null} onSelect={vi.fn()} />);

    expect(screen.getByTestId('customer-no-result')).toHaveTextContent('Use Novo contato');
  });

  it('shows nothing under the heading while the first page loads', () => {
    Object.assign(search, { items: [], isLoading: true });
    renderWithIntl(<CustomerSearchPanel selectedId={null} onSelect={vi.fn()} />);

    expect(screen.queryByTestId('customer-no-result')).not.toBeInTheDocument();
  });

  it('replaces the list with a retry when the search fails', async () => {
    Object.assign(search, { isError: true, items: [] });
    renderWithIntl(<CustomerSearchPanel selectedId={null} onSelect={vi.fn()} />);

    expect(screen.queryByTestId('customer-list')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));

    expect(search.retry).toHaveBeenCalledOnce();
  });
});

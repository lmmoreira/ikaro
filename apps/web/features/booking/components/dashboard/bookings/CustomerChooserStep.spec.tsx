// @vitest-environment jsdom
import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import { CustomerChooserStep } from './CustomerChooserStep';

const search = vi.hoisted(() => ({
  term: '',
  tooShort: false,
  items: [] as unknown[],
  isLoading: false,
  isError: false,
  retry: vi.fn(),
}));

vi.mock('@/features/booking/hooks/useCustomerSearch', () => ({
  MIN_CUSTOMER_SEARCH_LENGTH: 5,
  useCustomerSearch: () => search,
}));

const ANA = { customerId: 'c-1', name: 'Ana Costa', email: 'ana@x.com', phone: '+5531999991111' };
const NO_PHONE = { customerId: 'c-2', name: 'Bruno Lima', email: 'bruno@x.com', phone: null };

function setup(kind: 'agendamento' | 'recorrencia' = 'agendamento') {
  const onContinue = vi.fn();
  const onCancel = vi.fn();
  renderWithIntl(
    <CustomerChooserStep
      kind={kind}
      phonePrefix="+55"
      onContinue={onContinue}
      onCancel={onCancel}
    />,
  );
  return { onContinue, onCancel };
}

beforeEach(() => {
  Object.assign(search, {
    term: '',
    tooShort: false,
    items: [ANA, NO_PHONE],
    isLoading: false,
    isError: false,
  });
  search.retry.mockReset();
});

describe('CustomerChooserStep — Cliente cadastrado', () => {
  it('lists the first page under "Clientes" and cannot continue before one is picked', () => {
    setup();

    expect(screen.getByText('Clientes')).toBeInTheDocument();
    expect(screen.getAllByTestId('customer-row')).toHaveLength(2);
    expect(screen.getAllByTestId('chooser-continue')[0]!).toBeDisabled();
  });

  it('continues with the picked customer’s id only', async () => {
    const { onContinue } = setup();

    await userEvent.click(screen.getAllByTestId('customer-row')[0]!);
    await userEvent.click(screen.getAllByTestId('chooser-continue')[0]!);

    expect(onContinue).toHaveBeenCalledWith({ kind: 'customer', customerId: 'c-1' });
  });

  it('shows a customer without a phone as such, and still lets staff pick them', () => {
    setup();

    expect(screen.getByText(/sem telefone/)).toBeInTheDocument();
  });

  it('says when nothing matches the typed term', () => {
    Object.assign(search, { term: 'marin', items: [] });
    setup();

    expect(screen.getByTestId('customer-no-result')).toHaveTextContent(
      'Nenhum cliente encontrado para “marin”',
    );
    expect(screen.getByText('Resultados')).toBeInTheDocument();
  });

  it('shows a failed search with a retry', async () => {
    Object.assign(search, { isError: true, items: [] });
    setup();

    expect(screen.getByTestId('customer-search-error')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));

    expect(search.retry).toHaveBeenCalledOnce();
  });

  it('tells staff the minimum search length', () => {
    setup();

    expect(screen.getByText(/Digite pelo menos 5 caracteres/)).toBeInTheDocument();
  });

  it('cancels back to the agenda', async () => {
    const { onCancel } = setup();

    await userEvent.click(screen.getAllByRole('button', { name: 'Cancelar' })[0]!);

    expect(onCancel).toHaveBeenCalledOnce();
  });
});

describe('CustomerChooserStep — Novo contato', () => {
  async function openGuest() {
    const result = setup();
    await userEvent.click(screen.getAllByTestId('chooser-tab')[1]!);
    return result;
  }

  it('refuses an incomplete contact and names the problem', async () => {
    const { onContinue } = await openGuest();

    await userEvent.click(screen.getAllByTestId('chooser-continue')[0]!);

    expect(onContinue).not.toHaveBeenCalled();
    expect(screen.getByTestId('guest-error')).toBeInTheDocument();
  });

  it('continues with the contact trio and no customer id', async () => {
    const { onContinue } = await openGuest();

    fireEvent.change(screen.getByTestId('guest-name'), { target: { value: 'Maria' } });
    fireEvent.change(screen.getByTestId('guest-phone'), { target: { value: '31999990000' } });
    fireEvent.change(screen.getByTestId('guest-email'), { target: { value: 'maria@x.com' } });
    await userEvent.click(screen.getAllByTestId('chooser-continue')[0]!);

    expect(onContinue).toHaveBeenCalledWith({
      kind: 'guest',
      contactName: 'Maria',
      contactPhone: '+5531999990000',
      contactEmail: 'maria@x.com',
    });
  });
});

describe('CustomerChooserStep — for a recurrence', () => {
  it('disables the new-contact mode with the reason', () => {
    setup('recorrencia');

    expect(screen.getAllByTestId('chooser-tab')[1]).toBeDisabled();
    expect(screen.getByTestId('guest-disabled-reason')).toHaveTextContent(
      'Uma recorrência exige um cliente com conta',
    );
  });

  it('keeps the new-contact mode for a one-off booking', () => {
    setup('agendamento');

    expect(screen.getAllByTestId('chooser-tab')[1]).toBeEnabled();
    expect(screen.queryByTestId('guest-disabled-reason')).not.toBeInTheDocument();
  });
});

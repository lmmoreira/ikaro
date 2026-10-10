// @vitest-environment jsdom
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { makeHotsiteService, renderWithIntl } from '@/test-utils';
import { ResourceField, ServiceField } from './NewRecurringScheduleServiceFields';

const SERVICE = makeHotsiteService({
  name: 'Sala Aurora',
  durationMinutes: 120,
  price: { amount: 100, currency: 'BRL', formatted: 'R$ 100,00' },
});

type Query = React.ComponentProps<typeof ResourceField>['query'];

function query(overrides: Record<string, unknown>): Query {
  return { isError: false, isPending: false, data: [], ...overrides } as unknown as Query;
}

describe('ServiceField', () => {
  it('shows the selected service with its duration and price', () => {
    renderWithIntl(<ServiceField services={[SERVICE]} serviceId={SERVICE.id} onChange={vi.fn()} />);

    expect(screen.getByTestId('new-schedule-service')).toHaveTextContent(
      'Sala Aurora — 2h · R$ 100,00',
    );
    expect(
      screen.getByText('Só aparecem serviços que permitem reserva recorrente.'),
    ).toBeInTheDocument();
  });
});

describe('ResourceField', () => {
  const options = [
    { resourceId: 'room-a', name: 'Sala Aurora' },
    { resourceId: 'room-b', name: 'Sala Horizonte' },
  ];

  it('offers one pill per resource and reports the pick', () => {
    const onChange = vi.fn();
    renderWithIntl(
      <ResourceField
        query={query({ data: options })}
        resourceId="room-a"
        required={false}
        onChange={onChange}
      />,
    );

    expect(screen.getByRole('radio', { name: 'Sala Aurora' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    fireEvent.click(screen.getByRole('radio', { name: 'Sala Horizonte' }));
    expect(onChange).toHaveBeenCalledWith('room-b');
  });

  it('says it is loading, then that it failed', () => {
    const { unmount } = renderWithIntl(
      <ResourceField
        query={query({ isPending: true, data: undefined })}
        resourceId={null}
        required={false}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText('Carregando recursos…')).toBeInTheDocument();
    unmount();

    renderWithIntl(
      <ResourceField
        query={query({ isError: true, data: undefined })}
        resourceId={null}
        required={false}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível carregar os recursos');
  });

  it('shows the missing-resource message when required', () => {
    renderWithIntl(
      <ResourceField
        query={query({ data: options })}
        resourceId={null}
        required
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText('Escolha um recurso.')).toBeInTheDocument();
  });
});

// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import { makeSchedulingException } from './scheduling-exception.fixtures';
import { SchedulingExceptionGroups } from './SchedulingExceptionGroups';

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    className,
  }: {
    href: string;
    children?: React.ReactNode;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

const inBox2 = (id: string, who: string) =>
  makeSchedulingException({
    id,
    sourceId: 'res-box-2',
    booking: { contactName: who, resourceName: 'Box 2' },
  });
const inWalace = (id: string, who: string) =>
  makeSchedulingException({
    id,
    sourceId: 'res-walace',
    booking: { contactName: who, resourceName: 'Walace' },
  });

function renderGroups(props: Partial<React.ComponentProps<typeof SchedulingExceptionGroups>> = {}) {
  const handlers = {
    onToggle: vi.fn(),
    onToggleGroup: vi.fn(),
    onReassign: vi.fn(),
    onCancel: vi.fn(),
  };
  renderWithIntl(
    <SchedulingExceptionGroups
      items={[
        inBox2('e1', 'João Silva'),
        inWalace('e2', 'Carlos Lima'),
        inBox2('e3', 'Maria Oliveira'),
      ]}
      selected={new Set()}
      {...handlers}
      {...props}
    />,
  );
  return handlers;
}

describe('SchedulingExceptionGroups', () => {
  it('draws one section per unavailable resource, with its header and count', () => {
    renderGroups();

    const sections = screen.getAllByTestId('scheduling-exceptions-group');
    expect(sections).toHaveLength(2);
    expect(within(sections[0]).getByText('Box 2 ficou indisponível')).toBeInTheDocument();
    expect(within(sections[0]).getByText('2 reservas')).toBeInTheDocument();
    expect(within(sections[1]).getByText('Walace ficou indisponível')).toBeInTheDocument();
    expect(within(sections[1]).getByText('1 reserva')).toBeInTheDocument();
  });

  it('puts each entry in its own group, in order', () => {
    renderGroups();

    const [box2, walace] = screen.getAllByTestId('scheduling-exceptions-group');
    expect(within(box2).getByText('João Silva')).toBeInTheDocument();
    expect(within(box2).getByText('Maria Oliveira')).toBeInTheDocument();
    expect(within(walace).getByText('Carlos Lima')).toBeInTheDocument();
  });

  it('"Selecionar todos" hands over exactly that group’s entries', async () => {
    const user = userEvent.setup();
    const h = renderGroups();
    const [box2] = screen.getAllByTestId('scheduling-exceptions-group');

    await user.click(within(box2).getByRole('button', { name: 'Selecionar todos' }));

    expect(h.onToggleGroup).toHaveBeenCalledTimes(1);
    expect(h.onToggleGroup.mock.calls[0][0].map((i: { id: string }) => i.id)).toEqual(['e1', 'e3']);
  });

  it('marks the selected entries’ checkboxes', () => {
    renderGroups({ selected: new Set(['e2']) });

    const [box2, walace] = screen.getAllByTestId('scheduling-exceptions-group');
    expect(within(walace).getByRole('checkbox')).toBeChecked();
    within(box2)
      .getAllByRole('checkbox')
      .forEach((box) => expect(box).not.toBeChecked());
  });

  it('passes a row’s toggle, reassign and cancel up with the entry id', async () => {
    const user = userEvent.setup();
    const h = renderGroups();
    const [, walace] = screen.getAllByTestId('scheduling-exceptions-group');

    await user.click(within(walace).getByRole('checkbox'));
    await user.click(within(walace).getByRole('button', { name: 'Reatribuir' }));
    await user.click(within(walace).getByRole('button', { name: 'Cancelar' }));

    expect(h.onToggle).toHaveBeenCalledWith('e2');
    expect(h.onReassign).toHaveBeenCalledWith('e2');
    expect(h.onCancel).toHaveBeenCalledWith('e2');
  });

  it('shows a dash for a group whose resource name cannot be read', () => {
    renderGroups({ items: [makeSchedulingException({ id: 'e9', booking: null })] });

    expect(screen.getByText('— ficou indisponível')).toBeInTheDocument();
  });

  it('renders nothing for an empty list', () => {
    renderGroups({ items: [] });

    expect(screen.queryByTestId('scheduling-exceptions-group')).not.toBeInTheDocument();
  });
});

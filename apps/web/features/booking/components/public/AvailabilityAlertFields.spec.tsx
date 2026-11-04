// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { axe } from '@/axe-helper';
import { renderWithIntl } from '@/test-utils';
import { CriteriaChoice, FieldError, SummaryRow, WeekdayPicker } from './AvailabilityAlertFields';

describe('SummaryRow', () => {
  it('shows the label and value and carries its test id', () => {
    renderWithIntl(
      <dl>
        <SummaryRow label="Serviço" value="Lavagem Simples" testId="row" />
      </dl>,
    );

    expect(screen.getByTestId('row')).toHaveTextContent('Serviço');
    expect(screen.getByTestId('row')).toHaveTextContent('Lavagem Simples');
  });
});

describe('FieldError', () => {
  it('renders the message without a role (a field message never has one)', () => {
    renderWithIntl(<FieldError id="field-error" message="Informe o início do período." />);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByTestId('alert-field-error')).not.toHaveAttribute('role');
    expect(screen.getByTestId('alert-field-error')).toHaveTextContent(
      'Informe o início do período.',
    );
  });

  it('keeps the alert-field-error test id on the wrapper and draws the message with the branded field feedback under the given id', () => {
    renderWithIntl(<FieldError id="field-error" message="Informe o início do período." />);

    const wrapper = screen.getByTestId('alert-field-error');
    const message = screen.getByText('Informe o início do período.');
    expect(wrapper).toContainElement(message);
    expect(message.id).toBe('field-error');
    expect(message.getAttribute('style')).toContain('--ba-body-font');
    expect(message.className).not.toContain('text-red-600');
  });

  it('renders nothing without a message', () => {
    renderWithIntl(<FieldError id="field-error" message={null} />);

    expect(screen.queryByTestId('alert-field-error')).not.toBeInTheDocument();
  });
});

describe('CriteriaChoice', () => {
  it('labels the radio with the translated title and describes it with the hint', () => {
    renderWithIntl(
      <CriteriaChoice
        id="criteria-range"
        checked
        disabled={false}
        kind="range"
        onSelect={vi.fn()}
      />,
    );

    const radio = screen.getByRole('radio', { name: 'Período específico' });
    expect(radio).toBeChecked();
    expect(radio).toHaveAccessibleDescription('Entre duas datas e horários');
  });

  it('calls onSelect when chosen and is inert when disabled', async () => {
    const onSelect = vi.fn();
    const { rerender } = renderWithIntl(
      <CriteriaChoice
        id="criteria-weekly"
        checked={false}
        disabled={false}
        kind="weekly"
        onSelect={onSelect}
      />,
    );

    await userEvent.click(screen.getByRole('radio', { name: 'Preferência semanal' }));
    expect(onSelect).toHaveBeenCalledOnce();

    rerender(
      <CriteriaChoice
        id="criteria-weekly"
        checked={false}
        disabled
        kind="weekly"
        onSelect={onSelect}
      />,
    );
    expect(screen.getByRole('radio', { name: 'Preferência semanal' })).toBeDisabled();
  });
});

describe('WeekdayPicker', () => {
  it('draws the seven days Monday first, with a static test id and the day in data-day', () => {
    renderWithIntl(
      <WeekdayPicker selected={['tuesday']} disabled={false} error={null} onToggle={vi.fn()} />,
    );

    const pills = screen.getAllByTestId('alert-weekday');
    expect(pills.map((pill) => pill.dataset.day)).toEqual([
      'monday',
      'tuesday',
      'wednesday',
      'thursday',
      'friday',
      'saturday',
      'sunday',
    ]);
    expect(pills.map((pill) => pill.textContent)).toEqual([
      'Seg',
      'Ter',
      'Qua',
      'Qui',
      'Sex',
      'Sáb',
      'Dom',
    ]);
  });

  it('marks the selected days pressed and reports a toggle', async () => {
    const onToggle = vi.fn();
    renderWithIntl(
      <WeekdayPicker selected={['tuesday']} disabled={false} error={null} onToggle={onToggle} />,
    );

    expect(screen.getByRole('button', { name: 'Ter' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Qua' })).toHaveAttribute('aria-pressed', 'false');

    await userEvent.click(screen.getByRole('button', { name: 'Qua' }));

    expect(onToggle).toHaveBeenCalledWith('wednesday');
  });

  it('links the pills group to the error under it, with no role on the message', () => {
    renderWithIntl(
      <WeekdayPicker
        selected={[]}
        disabled={false}
        error="Escolha pelo menos um dia da semana."
        onToggle={vi.fn()}
      />,
    );

    const group = screen.getByRole('group', { name: 'Dias da semana' });
    expect(group).toHaveAccessibleDescription('Escolha pelo menos um dia da semana.');
    expect(screen.getByTestId('alert-field-error')).toHaveTextContent('Escolha pelo menos um dia');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('describes the group by nothing while there is no error', () => {
    renderWithIntl(
      <WeekdayPicker selected={[]} disabled={false} error={null} onToggle={vi.fn()} />,
    );

    expect(screen.getByRole('group')).not.toHaveAttribute('aria-describedby');
  });
});

describe('accessibility', () => {
  it('the field building blocks have no violations together', async () => {
    const { container } = renderWithIntl(
      <form>
        <CriteriaChoice id="c" checked disabled={false} kind="range" onSelect={vi.fn()} />
        <WeekdayPicker selected={[]} disabled={false} error={null} onToggle={vi.fn()} />
      </form>,
    );

    expect(await axe(container)).toHaveNoViolations();
  });
});

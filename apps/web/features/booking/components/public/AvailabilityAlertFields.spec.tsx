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
  it('renders the message as an alert', () => {
    renderWithIntl(<FieldError message="Informe o início do período." />);

    expect(screen.getByRole('alert')).toHaveTextContent('Informe o início do período.');
  });

  it('renders nothing without a message', () => {
    renderWithIntl(<FieldError message={null} />);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
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

  it('shows the error under the pills', () => {
    renderWithIntl(
      <WeekdayPicker
        selected={[]}
        disabled={false}
        error="Escolha pelo menos um dia da semana."
        onToggle={vi.fn()}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Escolha pelo menos um dia');
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

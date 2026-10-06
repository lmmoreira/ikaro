// @vitest-environment jsdom
import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { axe } from '@/axe-helper';
import { renderWithIntl } from '@/test-utils';
import {
  CriteriaChoice,
  ExpirySelect,
  FieldError,
  LabeledInput,
  SummaryRow,
  WeekdayPicker,
  fieldStyle,
} from './AvailabilityAlertFields';

describe('fieldStyle', () => {
  it('uses the tenant secondary colour normally and red when invalid', () => {
    expect(fieldStyle(false).borderColor).toBe('var(--ba-secondary)');
    expect(fieldStyle(true).borderColor).toBe('#dc2626');
  });
});

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

describe('LabeledInput', () => {
  it('labels the field with the translated key and reports edits', () => {
    const onChange = vi.fn();
    renderWithIntl(
      <LabeledInput
        id="alert-range-from"
        labelKey="range.from"
        type="datetime-local"
        value=""
        disabled={false}
        error={null}
        onChange={onChange}
      />,
    );

    fireEvent.change(screen.getByLabelText('De'), { target: { value: '2099-10-20T09:00' } });

    expect(onChange).toHaveBeenCalledWith('2099-10-20T09:00');
  });

  it('flags the field invalid and shows the error', () => {
    renderWithIntl(
      <LabeledInput
        id="alert-range-to"
        labelKey="range.to"
        type="datetime-local"
        value=""
        disabled={false}
        error="O fim do período precisa ser depois do início."
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('Até')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('O fim do período');
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

describe('ExpirySelect', () => {
  it('lists the five durations, marking the default and the maximum', () => {
    renderWithIntl(<ExpirySelect value={30} disabled={false} onChange={vi.fn()} />);

    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      '30 dias (padrão)',
      '60 dias',
      '90 dias',
      '180 dias',
      '365 dias (máximo)',
    ]);
  });

  it('reports the chosen number of days', async () => {
    const onChange = vi.fn();
    renderWithIntl(<ExpirySelect value={30} disabled={false} onChange={onChange} />);

    await userEvent.selectOptions(screen.getByTestId('alert-expiry'), '180');

    expect(onChange).toHaveBeenCalledWith(180);
  });
});

describe('accessibility', () => {
  it('the field primitives have no violations together', async () => {
    const { container } = renderWithIntl(
      <form>
        <CriteriaChoice id="c" checked disabled={false} kind="range" onSelect={vi.fn()} />
        <LabeledInput
          id="i"
          labelKey="range.from"
          type="datetime-local"
          value=""
          disabled={false}
          error={null}
          onChange={vi.fn()}
        />
        <WeekdayPicker selected={[]} disabled={false} error={null} onToggle={vi.fn()} />
        <ExpirySelect value={30} disabled={false} onChange={vi.fn()} />
      </form>,
    );

    expect(await axe(container)).toHaveNoViolations();
  });
});

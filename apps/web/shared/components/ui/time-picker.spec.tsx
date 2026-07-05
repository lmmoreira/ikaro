// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import { TimePicker } from './time-picker';

const LABELS = {
  hourAriaLabel: 'Hora',
  minuteAriaLabel: 'Minuto',
  periodAriaLabel: 'Período',
};

describe('TimePicker', () => {
  describe('24h format', () => {
    it('renders the hour and minute selects with zero-padded values, no period select', () => {
      renderWithIntl(<TimePicker value="09:05" onChange={vi.fn()} timeFormat="24h" {...LABELS} />);

      expect(screen.getByRole('combobox', { name: 'Hora' })).toHaveTextContent('09');
      expect(screen.getByRole('combobox', { name: 'Minuto' })).toHaveTextContent('05');
      expect(screen.queryByRole('combobox', { name: 'Período' })).not.toBeInTheDocument();
    });

    it('emits the new HH:MM when the hour changes', async () => {
      const onChange = vi.fn();
      const user = userEvent.setup();
      renderWithIntl(<TimePicker value="09:05" onChange={onChange} timeFormat="24h" {...LABELS} />);

      await user.click(screen.getByRole('combobox', { name: 'Hora' }));
      await user.click(screen.getByRole('option', { name: '14' }));

      expect(onChange).toHaveBeenCalledWith('14:05');
    });

    it('emits the new HH:MM when the minute changes', async () => {
      const onChange = vi.fn();
      const user = userEvent.setup();
      renderWithIntl(<TimePicker value="09:05" onChange={onChange} timeFormat="24h" {...LABELS} />);

      await user.click(screen.getByRole('combobox', { name: 'Minuto' }));
      await user.click(screen.getByRole('option', { name: '30' }));

      expect(onChange).toHaveBeenCalledWith('09:30');
    });

    it('renders midnight as hour 00, not 12', () => {
      renderWithIntl(<TimePicker value="00:00" onChange={vi.fn()} timeFormat="24h" {...LABELS} />);

      expect(screen.getByRole('combobox', { name: 'Hora' })).toHaveTextContent('00');
    });
  });

  describe('12h format', () => {
    it('shows the period select and converts 24h to 12h for display', () => {
      renderWithIntl(<TimePicker value="14:30" onChange={vi.fn()} timeFormat="12h" {...LABELS} />);

      expect(screen.getByRole('combobox', { name: 'Hora' })).toHaveTextContent('2');
      expect(screen.getByRole('combobox', { name: 'Minuto' })).toHaveTextContent('30');
      expect(screen.getByRole('combobox', { name: 'Período' })).toHaveTextContent('PM');
    });

    it('renders midnight (00:00) as 12 AM', () => {
      renderWithIntl(<TimePicker value="00:00" onChange={vi.fn()} timeFormat="12h" {...LABELS} />);

      expect(screen.getByRole('combobox', { name: 'Hora' })).toHaveTextContent('12');
      expect(screen.getByRole('combobox', { name: 'Período' })).toHaveTextContent('AM');
    });

    it('renders noon (12:00) as 12 PM', () => {
      renderWithIntl(<TimePicker value="12:00" onChange={vi.fn()} timeFormat="12h" {...LABELS} />);

      expect(screen.getByRole('combobox', { name: 'Hora' })).toHaveTextContent('12');
      expect(screen.getByRole('combobox', { name: 'Período' })).toHaveTextContent('PM');
    });

    it('emits the correct 24h value when switching the period from AM to PM', async () => {
      const onChange = vi.fn();
      const user = userEvent.setup();
      renderWithIntl(<TimePicker value="09:15" onChange={onChange} timeFormat="12h" {...LABELS} />);

      await user.click(screen.getByRole('combobox', { name: 'Período' }));
      await user.click(screen.getByRole('option', { name: 'PM' }));

      expect(onChange).toHaveBeenCalledWith('21:15');
    });

    it('emits the correct 24h value when changing the 12h hour', async () => {
      const onChange = vi.fn();
      const user = userEvent.setup();
      renderWithIntl(<TimePicker value="14:30" onChange={onChange} timeFormat="12h" {...LABELS} />);

      await user.click(screen.getByRole('combobox', { name: 'Hora' }));
      await user.click(screen.getByRole('option', { name: '9' }));

      expect(onChange).toHaveBeenCalledWith('21:30');
    });
  });

  it('disables all selects when disabled is true', () => {
    renderWithIntl(
      <TimePicker value="09:00" onChange={vi.fn()} timeFormat="12h" disabled {...LABELS} />,
    );

    expect(screen.getByRole('combobox', { name: 'Hora' })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: 'Minuto' })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: 'Período' })).toBeDisabled();
  });
});

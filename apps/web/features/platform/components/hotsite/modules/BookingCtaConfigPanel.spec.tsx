// @vitest-environment jsdom
import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { BookingCtaModuleData } from '@ikaro/types';
import { renderWithIntl } from '@/test-utils';
import { BookingCtaConfigPanel } from './BookingCtaConfigPanel';
import { writeModuleData } from './module-config-panel.types';

vi.mock('@/features/platform/api/tenant-settings', () => ({
  generateHotsiteImageSignedUrl: vi.fn(),
  deleteHotsiteImage: vi.fn(),
}));

const BOOKING_CTA: BookingCtaModuleData = { title: 'Pronto?', ctaLabel: 'Agendar' };

describe('BookingCtaConfigPanel', () => {
  it('renders current values', () => {
    renderWithIntl(
      <BookingCtaConfigPanel data={writeModuleData(BOOKING_CTA)} onChange={vi.fn()} />,
    );

    expect(screen.getByDisplayValue('Pronto?')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Agendar')).toBeInTheDocument();
  });

  it('editing the title calls onChange with only that field updated', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    renderWithIntl(
      <BookingCtaConfigPanel data={writeModuleData(BOOKING_CTA)} onChange={onChange} />,
    );

    await user.type(screen.getByLabelText('Título *'), 'X');

    expect(onChange).toHaveBeenLastCalledWith(
      writeModuleData({ ...BOOKING_CTA, title: 'Pronto?X' }),
    );
  });

  it('renders the Calendar section with datePickerType defaulting to carousel and carouselDays visible', () => {
    renderWithIntl(
      <BookingCtaConfigPanel data={writeModuleData(BOOKING_CTA)} onChange={vi.fn()} />,
    );

    expect(screen.getByTestId('booking-cta-date-picker-type-carousel')).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByLabelText('Número de dias exibidos')).toBeInTheDocument();
  });

  it('hides carouselDays when datePickerType is calendar', () => {
    renderWithIntl(
      <BookingCtaConfigPanel
        data={writeModuleData({ ...BOOKING_CTA, datePickerType: 'calendar' })}
        onChange={vi.fn()}
      />,
    );

    expect(screen.queryByLabelText('Número de dias exibidos')).not.toBeInTheDocument();
  });

  it('changing datePickerType updates only that field', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    renderWithIntl(
      <BookingCtaConfigPanel data={writeModuleData(BOOKING_CTA)} onChange={onChange} />,
    );

    await user.click(screen.getByTestId('booking-cta-date-picker-type-calendar'));

    expect(onChange).toHaveBeenLastCalledWith(
      writeModuleData({ ...BOOKING_CTA, datePickerType: 'calendar' }),
    );
  });

  it('editing carouselDays calls onChange with the parsed number', () => {
    const onChange = vi.fn();

    renderWithIntl(
      <BookingCtaConfigPanel data={writeModuleData(BOOKING_CTA)} onChange={onChange} />,
    );

    fireEvent.change(screen.getByLabelText('Número de dias exibidos'), {
      target: { value: '30' },
    });

    expect(onChange).toHaveBeenLastCalledWith(
      writeModuleData({ ...BOOKING_CTA, carouselDays: 30 }),
    );
  });

  it('editing subtitle, eyebrow, and ctaLabel each update only their own field', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    renderWithIntl(
      <BookingCtaConfigPanel data={writeModuleData(BOOKING_CTA)} onChange={onChange} />,
    );

    await user.type(screen.getByLabelText('Subtítulo (opcional)'), 'S');
    expect(onChange).toHaveBeenLastCalledWith(writeModuleData({ ...BOOKING_CTA, subtitle: 'S' }));

    await user.type(screen.getByLabelText('Texto de destaque (opcional)'), 'E');
    expect(onChange).toHaveBeenLastCalledWith(writeModuleData({ ...BOOKING_CTA, eyebrow: 'E' }));

    await user.type(screen.getByLabelText('Texto do botão *'), 'X');
    expect(onChange).toHaveBeenLastCalledWith(
      writeModuleData({ ...BOOKING_CTA, ctaLabel: 'AgendarX' }),
    );
  });

  it('changing variant, bgStyle, and rightPanel pills each update only their own field', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    renderWithIntl(
      <BookingCtaConfigPanel data={writeModuleData(BOOKING_CTA)} onChange={onChange} />,
    );

    await user.click(screen.getByTestId('booking-cta-variant-left-aligned'));
    expect(onChange).toHaveBeenLastCalledWith(
      writeModuleData({ ...BOOKING_CTA, variant: 'left-aligned' }),
    );

    await user.click(screen.getByTestId('booking-cta-bg-style-background'));
    expect(onChange).toHaveBeenLastCalledWith(
      writeModuleData({ ...BOOKING_CTA, bgStyle: 'background' }),
    );

    await user.click(screen.getByTestId('booking-cta-right-panel-brand-card'));
    expect(onChange).toHaveBeenLastCalledWith(
      writeModuleData({ ...BOOKING_CTA, rightPanel: 'brand-card' }),
    );
  });
});

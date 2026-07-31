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

  it.each([
    ['passes through a valid value', '30', 30],
    ['clamps a value above 90 down to 90', '91', 90],
    ['clamps a value below 1 up to 1', '-2', 1],
    ['rounds a decimal value to the nearest integer', '1.5', 2],
    ['falls back to 1 for a non-numeric value', '', 1],
  ])('editing carouselDays: %s', (_description, typedValue, expectedCarouselDays) => {
    const onChange = vi.fn();

    renderWithIntl(
      <BookingCtaConfigPanel data={writeModuleData(BOOKING_CTA)} onChange={onChange} />,
    );

    fireEvent.change(screen.getByLabelText('Número de dias exibidos'), {
      target: { value: typedValue },
    });

    expect(onChange).toHaveBeenLastCalledWith(
      writeModuleData({ ...BOOKING_CTA, carouselDays: expectedCarouselDays }),
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

  describe('content position (M18-S05)', () => {
    it('always renders the Y (vertical) picker', () => {
      renderWithIntl(
        <BookingCtaConfigPanel data={writeModuleData(BOOKING_CTA)} onChange={vi.fn()} />,
      );

      expect(screen.getByTestId('booking-cta-content-position-y-center')).toBeInTheDocument();
    });

    it('renders the X (horizontal) picker when variant defaults to "centered"', () => {
      renderWithIntl(
        <BookingCtaConfigPanel data={writeModuleData(BOOKING_CTA)} onChange={vi.fn()} />,
      );

      expect(screen.getByTestId('booking-cta-content-position-x-center')).toBeInTheDocument();
    });

    it('does not render the X (horizontal) picker when variant is "left-aligned"', () => {
      renderWithIntl(
        <BookingCtaConfigPanel
          data={writeModuleData({ ...BOOKING_CTA, variant: 'left-aligned' })}
          onChange={vi.fn()}
        />,
      );

      expect(screen.queryByTestId('booking-cta-content-position-x-center')).not.toBeInTheDocument();
      expect(screen.getByTestId('booking-cta-content-position-y-center')).toBeInTheDocument();
    });

    it('changing the X pill calls onChange with only contentPositionX updated', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();

      renderWithIntl(
        <BookingCtaConfigPanel data={writeModuleData(BOOKING_CTA)} onChange={onChange} />,
      );

      await user.click(screen.getByTestId('booking-cta-content-position-x-right'));

      expect(onChange).toHaveBeenCalledWith(
        writeModuleData({ ...BOOKING_CTA, contentPositionX: 'right' }),
      );
    });

    it('changing the Y pill calls onChange with only contentPositionY updated', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();

      renderWithIntl(
        <BookingCtaConfigPanel data={writeModuleData(BOOKING_CTA)} onChange={onChange} />,
      );

      await user.click(screen.getByTestId('booking-cta-content-position-y-bottom'));

      expect(onChange).toHaveBeenCalledWith(
        writeModuleData({ ...BOOKING_CTA, contentPositionY: 'bottom' }),
      );
    });

    it('switching variant to "left-aligned" while contentPositionX is set does not crash', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      const withX: BookingCtaModuleData = { ...BOOKING_CTA, contentPositionX: 'right' };

      renderWithIntl(<BookingCtaConfigPanel data={writeModuleData(withX)} onChange={onChange} />);

      await user.click(screen.getByTestId('booking-cta-variant-left-aligned'));

      expect(onChange).toHaveBeenCalledWith(writeModuleData({ ...withX, variant: 'left-aligned' }));
    });
  });
});

// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { BookingCtaModuleData } from '@ikaro/types';
import { renderWithIntl } from '@/test-utils';
import { BookingCtaConfigPanel } from './BookingCtaConfigPanel';
import { writeModuleData } from './module-config-panel.types';

vi.mock('@/features/platform/tenant-settings', () => ({
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

  it('does not render a carouselDays field', () => {
    renderWithIntl(
      <BookingCtaConfigPanel data={writeModuleData(BOOKING_CTA)} onChange={vi.fn()} />,
    );

    expect(screen.queryByText(/carousel/i)).not.toBeInTheDocument();
  });
});

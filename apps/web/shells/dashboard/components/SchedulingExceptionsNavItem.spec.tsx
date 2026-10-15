// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SchedulingExceptionsSheetItem,
  SchedulingExceptionsSidebarItem,
} from './SchedulingExceptionsNavItem';

const count = vi.hoisted(() => ({ value: 3 as number | undefined }));

vi.mock('@/features/booking/hooks/useSchedulingExceptions', () => ({
  useOpenSchedulingExceptionsCount: () => ({ data: count.value }),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) =>
    key === 'nav.schedulingExceptions' ? 'Reservas a resolver' : key,
}));

vi.mock('next/navigation', () => ({ usePathname: vi.fn() }));
import { usePathname } from 'next/navigation';

beforeEach(() => {
  count.value = 3;
  vi.mocked(usePathname).mockReturnValue('/dashboard/bookings');
});

describe('SchedulingExceptionsSidebarItem', () => {
  it('links to the section and shows the open count', () => {
    render(<SchedulingExceptionsSidebarItem />);

    expect(screen.getByTestId('sidebar-nav-scheduling-exceptions')).toHaveAttribute(
      'href',
      '/dashboard/scheduling-exceptions',
    );
    expect(screen.getByText('Reservas a resolver')).toBeInTheDocument();
    expect(screen.getByTestId('scheduling-exceptions-badge')).toHaveTextContent('3');
  });

  it.each([
    ['nothing is open', 0],
    ['the count has not loaded yet', undefined],
  ])('shows no badge when %s', (_label, value) => {
    count.value = value;
    render(<SchedulingExceptionsSidebarItem />);

    expect(screen.queryByTestId('scheduling-exceptions-badge')).not.toBeInTheDocument();
  });

  it('is active on the list and on the reschedule drill-down, not elsewhere', () => {
    const { rerender } = render(<SchedulingExceptionsSidebarItem />);
    expect(screen.getByTestId('sidebar-nav-scheduling-exceptions')).not.toHaveClass('bg-blue-600');

    vi.mocked(usePathname).mockReturnValue('/dashboard/scheduling-exceptions');
    rerender(<SchedulingExceptionsSidebarItem />);
    expect(screen.getByTestId('sidebar-nav-scheduling-exceptions')).toHaveClass('bg-blue-600');

    vi.mocked(usePathname).mockReturnValue('/dashboard/scheduling-exceptions/exc-1/reschedule');
    rerender(<SchedulingExceptionsSidebarItem />);
    expect(screen.getByTestId('sidebar-nav-scheduling-exceptions')).toHaveClass('bg-blue-600');
  });
});

describe('SchedulingExceptionsSheetItem', () => {
  it('links to the section with the open count', () => {
    render(<SchedulingExceptionsSheetItem onClose={vi.fn()} />);

    expect(screen.getByTestId('more-sheet-scheduling-exceptions')).toHaveAttribute(
      'href',
      '/dashboard/scheduling-exceptions',
    );
    expect(screen.getByTestId('scheduling-exceptions-badge')).toHaveTextContent('3');
  });

  it('shows no badge when nothing is open', () => {
    count.value = 0;
    render(<SchedulingExceptionsSheetItem onClose={vi.fn()} />);

    expect(screen.queryByTestId('scheduling-exceptions-badge')).not.toBeInTheDocument();
  });

  it('closes the sheet when chosen', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<SchedulingExceptionsSheetItem onClose={onClose} />);

    await user.click(screen.getByTestId('more-sheet-scheduling-exceptions'));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

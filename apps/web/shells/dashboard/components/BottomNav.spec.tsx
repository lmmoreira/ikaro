// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BottomNav } from './BottomNav';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const map: Record<string, string> = {
      'nav.bookings': 'Agenda',
      'nav.schedule': 'Horários',
      'nav.services': 'Serviços',
      'nav.loyalty': 'Fidelidade',
      'nav.more': 'Mais',
      'nav.moreOptions': 'Mais opções',
    };
    return map[key] ?? key;
  },
}));

vi.mock('next/navigation', () => ({ usePathname: vi.fn() }));
import { usePathname } from 'next/navigation';

const STAFF = 'STAFF' as const;
const MANAGER = 'MANAGER' as const;

beforeEach(() => {
  vi.mocked(usePathname).mockReturnValue('/dashboard/bookings');
});

describe('BottomNav', () => {
  it.each([
    ['booking detail routes', '/dashboard/bookings/booking-123'],
    ['booking completion routes', '/dashboard/bookings/booking-123/complete'],
    ['service edit routes', '/dashboard/services/svc-1/edit'],
    ['service deactivate routes', '/dashboard/services/svc-1/deactivate'],
    ['loyalty detail routes', '/dashboard/loyalty/c-1'],
  ])('hides itself on %s', (_label, pathname) => {
    vi.mocked(usePathname).mockReturnValue(pathname);
    const { container } = render(<BottomNav role={STAFF} onOpenSheet={vi.fn()} />);

    expect(container).toBeEmptyDOMElement();
  });

  it.each([
    ['the service create route (fixed action bar owns the bottom edge)', '/dashboard/services/new'],
    ['the team invite route (fixed action bar owns the bottom edge)', '/dashboard/team/invite'],
    ['the team detail route (fixed Save bar owns the bottom edge)', '/dashboard/team/staff-1'],
    [
      'the team deactivate route (fixed action bar owns the bottom edge)',
      '/dashboard/team/staff-1/deactivate',
    ],
  ])('hides itself on %s', (_label, pathname) => {
    vi.mocked(usePathname).mockReturnValue(pathname);
    const { container } = render(<BottomNav role={MANAGER} onOpenSheet={vi.fn()} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('still renders on the team list page (FAB sits above the nav, no fixed bar)', () => {
    vi.mocked(usePathname).mockReturnValue('/dashboard/team');
    render(<BottomNav role={MANAGER} onOpenSheet={vi.fn()} />);

    expect(screen.getByText('Mais')).toBeInTheDocument();
  });

  // Settings and Hotsite are top-level sections with no topbar back arrow (unlike every route
  // above) — hiding BottomNav there left mobile users with no way to reach any other section.
  // Their own fixed action bars are offset above BottomNav instead of hidden behind it.
  it.each([
    ['the settings page', '/dashboard/settings'],
    ['the hotsite editor page', '/dashboard/hotsite'],
  ])(
    'still renders on %s (own action bar sits above it, not hidden behind it)',
    (_label, pathname) => {
      vi.mocked(usePathname).mockReturnValue(pathname);
      render(<BottomNav role={MANAGER} onOpenSheet={vi.fn()} />);

      expect(screen.getByText('Mais')).toBeInTheDocument();
    },
  );

  it('renders the 4 core nav items for STAFF', () => {
    render(<BottomNav role={STAFF} onOpenSheet={vi.fn()} />);

    expect(screen.getByText('Agenda')).toBeInTheDocument();
    expect(screen.getByText('Horários')).toBeInTheDocument();
    expect(screen.getByText('Serviços')).toBeInTheDocument();
    expect(screen.getByText('Fidelidade')).toBeInTheDocument();
    expect(screen.queryByText('Mais')).not.toBeInTheDocument();
  });

  it('renders a "Mais" button for MANAGER', () => {
    render(<BottomNav role={MANAGER} onOpenSheet={vi.fn()} />);

    expect(screen.getByText('Mais')).toBeInTheDocument();
  });

  it('calls onOpenSheet when "Mais" is clicked', async () => {
    const onOpenSheet = vi.fn();
    render(<BottomNav role={MANAGER} onOpenSheet={onOpenSheet} />);

    await userEvent.click(screen.getByText('Mais'));

    expect(onOpenSheet).toHaveBeenCalledOnce();
  });

  it('applies active class to the item matching the current pathname', () => {
    vi.mocked(usePathname).mockReturnValue('/dashboard/bookings');
    render(<BottomNav role={STAFF} onOpenSheet={vi.fn()} />);

    const agendaLink = screen.getByText('Agenda').closest('a');
    expect(agendaLink?.className).toContain('text-blue-600');

    const horarioLink = screen.getByText('Horários').closest('a');
    expect(horarioLink?.className).not.toContain('text-blue-600');
  });
});

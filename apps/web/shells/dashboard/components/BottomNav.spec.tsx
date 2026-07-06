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
  it('hides itself on booking detail routes', () => {
    vi.mocked(usePathname).mockReturnValue('/dashboard/bookings/booking-123');
    const { container } = render(<BottomNav role={STAFF} onOpenSheet={vi.fn()} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('hides itself on booking completion routes', () => {
    vi.mocked(usePathname).mockReturnValue('/dashboard/bookings/booking-123/complete');
    const { container } = render(<BottomNav role={STAFF} onOpenSheet={vi.fn()} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('hides itself on service edit routes', () => {
    vi.mocked(usePathname).mockReturnValue('/dashboard/services/svc-1/edit');
    const { container } = render(<BottomNav role={STAFF} onOpenSheet={vi.fn()} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('hides itself on service deactivate routes', () => {
    vi.mocked(usePathname).mockReturnValue('/dashboard/services/svc-1/deactivate');
    const { container } = render(<BottomNav role={STAFF} onOpenSheet={vi.fn()} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('hides itself on loyalty detail routes', () => {
    vi.mocked(usePathname).mockReturnValue('/dashboard/loyalty/c-1');
    const { container } = render(<BottomNav role={STAFF} onOpenSheet={vi.fn()} />);

    expect(container).toBeEmptyDOMElement();
  });

  it.each([
    ['the settings page (fixed Save bar owns the bottom edge)', '/dashboard/settings'],
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

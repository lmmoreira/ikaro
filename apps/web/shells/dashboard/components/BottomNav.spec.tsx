// @vitest-environment jsdom
import type { ComponentProps } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveDashboardNav } from '@/shells/dashboard/model/dashboard-nav';
import { BottomNav as BottomNavView } from './BottomNav';

// The shell resolves the navigation once and hands it to the bar; these cases state the facts
// (role, the lead-form switch, the locked features) and let the registry resolve them, as the shell
// does.
type BottomNavProps = Omit<ComponentProps<typeof BottomNavView>, 'nav'> & {
  readonly role: 'STAFF' | 'MANAGER';
  readonly leadFormEnabled: boolean;
};

function BottomNav({ role, leadFormEnabled, ...props }: BottomNavProps): React.JSX.Element | null {
  const nav = resolveDashboardNav({
    role,
    lockedFeatures: props.lockedFeatures,
    toggles: { leadForm: leadFormEnabled },
  });
  return <BottomNavView {...props} nav={nav} />;
}

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
    const { container } = render(
      <BottomNav role={STAFF} leadFormEnabled={false} lockedFeatures={[]} onOpenSheet={vi.fn()} />,
    );

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
    [
      'the resource create route (fixed action bar owns the bottom edge)',
      '/dashboard/resources/new',
    ],
    [
      'the staff new-booking chooser (fixed action bar owns the bottom edge)',
      '/dashboard/bookings/new',
    ],
    [
      'the staff new-booking steps (fixed action bar owns the bottom edge)',
      '/dashboard/bookings/new/booking',
    ],
    ['the resource detail route (fixed Save bar owns the bottom edge)', '/dashboard/resources/r-1'],
    [
      'the "Reservas a resolver" reschedule drill-down (the reschedule action bar owns the bottom edge)',
      '/dashboard/scheduling-exceptions/exc-1/reschedule',
    ],
    [
      'the resource deactivate route (fixed action bar owns the bottom edge)',
      '/dashboard/resources/r-1/deactivate',
    ],
    [
      'the recurring-schedule approval screen (its fixed action bar owns the bottom edge)',
      '/dashboard/bookings/recurring/s-1',
    ],
    [
      'the staff new-recurrence pattern page (its fixed action bar owns the bottom edge)',
      '/dashboard/bookings/recurring/new',
    ],
  ])('hides itself on %s', (_label, pathname) => {
    vi.mocked(usePathname).mockReturnValue(pathname);
    const { container } = render(
      <BottomNav
        role={MANAGER}
        leadFormEnabled={false}
        lockedFeatures={[]}
        onOpenSheet={vi.fn()}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it.each([
    ['the team list page (FAB sits above the nav, no fixed bar)', '/dashboard/team'],
    ['the resources list page (FAB sits above the nav, no fixed bar)', '/dashboard/resources'],
    [
      'the "Reservas a resolver" list (its selection bar sits above the nav, which stays)',
      '/dashboard/scheduling-exceptions',
    ],
  ])('still renders on %s', (_label, pathname) => {
    vi.mocked(usePathname).mockReturnValue(pathname);
    render(
      <BottomNav
        role={MANAGER}
        leadFormEnabled={false}
        lockedFeatures={[]}
        onOpenSheet={vi.fn()}
      />,
    );

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
      render(
        <BottomNav
          role={MANAGER}
          leadFormEnabled={false}
          lockedFeatures={[]}
          onOpenSheet={vi.fn()}
        />,
      );

      expect(screen.getByText('Mais')).toBeInTheDocument();
    },
  );

  it('renders the 4 core nav items for STAFF, no "Mais" when leadFormEnabled is false', () => {
    render(
      <BottomNav role={STAFF} leadFormEnabled={false} lockedFeatures={[]} onOpenSheet={vi.fn()} />,
    );

    expect(screen.getByText('Agenda')).toBeInTheDocument();
    expect(screen.getByText('Horários')).toBeInTheDocument();
    expect(screen.getByText('Serviços')).toBeInTheDocument();
    expect(screen.getByText('Fidelidade')).toBeInTheDocument();
    expect(screen.queryByText('Mais')).not.toBeInTheDocument();
  });

  it('renders a "Mais" button for STAFF once leadFormEnabled is true', () => {
    render(
      <BottomNav role={STAFF} leadFormEnabled={true} lockedFeatures={[]} onOpenSheet={vi.fn()} />,
    );

    expect(screen.getByText('Mais')).toBeInTheDocument();
  });

  it('renders a "Mais" button for MANAGER regardless of leadFormEnabled', () => {
    render(
      <BottomNav
        role={MANAGER}
        leadFormEnabled={false}
        lockedFeatures={[]}
        onOpenSheet={vi.fn()}
      />,
    );

    expect(screen.getByText('Mais')).toBeInTheDocument();
  });

  it('calls onOpenSheet when "Mais" is clicked', async () => {
    const onOpenSheet = vi.fn();
    render(
      <BottomNav
        role={MANAGER}
        leadFormEnabled={false}
        lockedFeatures={[]}
        onOpenSheet={onOpenSheet}
      />,
    );

    await userEvent.click(screen.getByText('Mais'));

    expect(onOpenSheet).toHaveBeenCalledOnce();
  });

  it('applies active class to the item matching the current pathname', () => {
    vi.mocked(usePathname).mockReturnValue('/dashboard/bookings');
    render(
      <BottomNav role={STAFF} leadFormEnabled={false} lockedFeatures={[]} onOpenSheet={vi.fn()} />,
    );

    const agendaLink = screen.getByText('Agenda').closest('a');
    expect(agendaLink?.className).toContain('text-blue-600');

    const horarioLink = screen.getByText('Horários').closest('a');
    expect(horarioLink?.className).not.toContain('text-blue-600');
  });
});

describe('BottomNav — locked items (UC-125)', () => {
  it('shows a locked feature as a padlocked tab that keeps its href', () => {
    render(
      <BottomNav
        role={STAFF}
        leadFormEnabled={false}
        lockedFeatures={['LOYALTY']}
        onOpenSheet={vi.fn()}
      />,
    );

    const tab = screen.getByRole('link', { name: /Fidelidade/ });
    expect(tab).toHaveAttribute('href', '/dashboard/loyalty');
    expect(tab).toHaveAttribute('data-locked', 'true');
    expect(screen.getAllByTestId('nav-lock')).toHaveLength(1);
  });

  it('draws no padlock when nothing is locked', () => {
    render(
      <BottomNav role={STAFF} leadFormEnabled={false} lockedFeatures={[]} onOpenSheet={vi.fn()} />,
    );

    expect(screen.queryByTestId('nav-lock')).not.toBeInTheDocument();
  });

  it('offers "Mais" to STAFF when Leads is shown locked, since the sheet holds it', () => {
    render(
      <BottomNav
        role={STAFF}
        leadFormEnabled={false}
        lockedFeatures={['LEAD_FORM']}
        onOpenSheet={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Mais opções' })).toBeInTheDocument();
  });

  it('keeps STAFF without "Mais" when Leads is entitled but not enabled', () => {
    render(
      <BottomNav role={STAFF} leadFormEnabled={false} lockedFeatures={[]} onOpenSheet={vi.fn()} />,
    );

    expect(screen.queryByRole('button', { name: 'Mais opções' })).not.toBeInTheDocument();
  });
});

describe('BottomNav — locked drill-down route (UC-125)', () => {
  it('stays visible on a loyalty detail route while LOYALTY is locked, as the way out on mobile', () => {
    vi.mocked(usePathname).mockReturnValue('/dashboard/loyalty/c-1');

    const { container } = render(
      <BottomNav
        role={STAFF}
        leadFormEnabled={false}
        lockedFeatures={['LOYALTY']}
        onOpenSheet={vi.fn()}
      />,
    );

    expect(container).not.toBeEmptyDOMElement();
    expect(screen.getByRole('link', { name: /Agenda/ })).toBeInTheDocument();
  });

  it('still hides on that route when LOYALTY is entitled', () => {
    vi.mocked(usePathname).mockReturnValue('/dashboard/loyalty/c-1');

    const { container } = render(
      <BottomNav role={STAFF} leadFormEnabled={false} lockedFeatures={[]} onOpenSheet={vi.fn()} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('still hides on a booking detail route when only another feature is locked', () => {
    vi.mocked(usePathname).mockReturnValue('/dashboard/bookings/booking-123');

    const { container } = render(
      <BottomNav
        role={STAFF}
        leadFormEnabled={false}
        lockedFeatures={['LOYALTY']}
        onOpenSheet={vi.fn()}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});

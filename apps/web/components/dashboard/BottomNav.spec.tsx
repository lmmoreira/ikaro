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

// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { BottomNav } from './BottomNav';

vi.mock('next/navigation', () => ({ usePathname: vi.fn() }));
vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    className,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

import { usePathname } from 'next/navigation';

beforeEach(() => {
  vi.mocked(usePathname).mockReturnValue('/dashboard/bookings');
});

describe('BottomNav', () => {
  it('renders the 4 core nav items for STAFF', () => {
    render(<BottomNav role="STAFF" onOpenSheet={vi.fn()} />);

    expect(screen.getByText('Agenda')).toBeInTheDocument();
    expect(screen.getByText('Horários')).toBeInTheDocument();
    expect(screen.getByText('Serviços')).toBeInTheDocument();
    expect(screen.getByText('Fidelidade')).toBeInTheDocument();
    expect(screen.queryByText('Mais')).not.toBeInTheDocument();
  });

  it('renders a "Mais" button for MANAGER', () => {
    render(<BottomNav role="MANAGER" onOpenSheet={vi.fn()} />);

    expect(screen.getByText('Mais')).toBeInTheDocument();
  });

  it('calls onOpenSheet when "Mais" is clicked', async () => {
    const onOpenSheet = vi.fn();
    render(<BottomNav role="MANAGER" onOpenSheet={onOpenSheet} />);

    await userEvent.click(screen.getByText('Mais'));

    expect(onOpenSheet).toHaveBeenCalledOnce();
  });

  it('applies active class to the item matching the current pathname', () => {
    vi.mocked(usePathname).mockReturnValue('/dashboard/bookings');
    render(<BottomNav role="STAFF" onOpenSheet={vi.fn()} />);

    const agendaLink = screen.getByText('Agenda').closest('a');
    expect(agendaLink?.className).toContain('text-blue-600');

    const horarioLink = screen.getByText('Horários').closest('a');
    expect(horarioLink?.className).not.toContain('text-blue-600');
  });
});

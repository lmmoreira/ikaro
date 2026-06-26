// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Topbar } from './Topbar';

vi.mock('next/navigation', () => ({ usePathname: vi.fn() }));

import { usePathname } from 'next/navigation';

beforeEach(() => {
  vi.mocked(usePathname).mockReturnValue('/dashboard/bookings');
});

describe('Topbar', () => {
  it('renders the tenant name on mobile', () => {
    render(<Topbar tenantName="Lavacar BH" userName="Ana Pereira" />);

    expect(screen.getByText('Lavacar BH')).toBeInTheDocument();
  });

  it('renders user initials in the mobile avatar', () => {
    render(<Topbar tenantName="Lavacar BH" userName="Ana Pereira" />);

    expect(screen.getByText('AP')).toBeInTheDocument();
  });

  it('shows "?" as initials when userName is null', () => {
    render(<Topbar tenantName="Lavacar BH" userName={null} />);

    expect(screen.getByText('?')).toBeInTheDocument();
  });

  it('renders the page title matching the current pathname', () => {
    vi.mocked(usePathname).mockReturnValue('/dashboard/bookings');
    render(<Topbar tenantName="Lavacar BH" userName="Ana" />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Agenda');
  });

  it('falls back to "Dashboard" for an unrecognised pathname', () => {
    vi.mocked(usePathname).mockReturnValue('/dashboard/unknown');
    render(<Topbar tenantName="Lavacar BH" userName="Ana" />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Dashboard');
  });

  it('renders first-letter logo mark from tenant name', () => {
    render(<Topbar tenantName="Lavacar BH" userName="Ana" />);

    expect(screen.getByText('L')).toBeInTheDocument();
  });
});

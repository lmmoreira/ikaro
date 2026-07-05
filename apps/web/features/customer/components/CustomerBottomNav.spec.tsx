// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CustomerBottomNav } from './CustomerBottomNav';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('next/navigation', () => ({
  usePathname: vi.fn().mockReturnValue('/lavacar-bh/my-account'),
}));

import { usePathname } from 'next/navigation';

describe('CustomerBottomNav', () => {
  it('renders links for home, bookings, and loyalty', () => {
    render(<CustomerBottomNav tenantSlug="lavacar-bh" />);

    const nav = screen.getByRole('navigation', { name: 'customer-bottom-nav' });
    expect(nav.querySelector('a[href="/lavacar-bh/my-account"]')).toBeInTheDocument();
    expect(nav.querySelector('a[href="/lavacar-bh/my-account/bookings"]')).toBeInTheDocument();
    expect(nav.querySelector('a[href="/lavacar-bh/my-account/loyalty"]')).toBeInTheDocument();
  });

  it('marks home as active with exact match on root path', () => {
    vi.mocked(usePathname).mockReturnValue('/lavacar-bh/my-account');
    render(<CustomerBottomNav tenantSlug="lavacar-bh" />);

    const nav = screen.getByRole('navigation', { name: 'customer-bottom-nav' });
    expect(nav.querySelector('a[href="/lavacar-bh/my-account"] span')?.className).toContain(
      'text-blue-600',
    );
  });

  it('marks bookings as active on the bookings tab route', () => {
    vi.mocked(usePathname).mockReturnValue('/lavacar-bh/my-account/bookings');
    render(<CustomerBottomNav tenantSlug="lavacar-bh" />);

    const nav = screen.getByRole('navigation', { name: 'customer-bottom-nav' });
    expect(
      nav.querySelector('a[href="/lavacar-bh/my-account/bookings"] span')?.className,
    ).toContain('text-blue-600');
    expect(nav.querySelector('a[href="/lavacar-bh/my-account"] span')?.className).toContain(
      'text-gray-900/40',
    );
  });

  it('renders nothing on a booking detail drill-down route (M13-S28)', () => {
    vi.mocked(usePathname).mockReturnValue('/lavacar-bh/my-account/bookings/booking-id');
    const { container } = render(<CustomerBottomNav tenantSlug="lavacar-bh" />);

    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing on the cancel confirmation drill-down route (M13-S28)', () => {
    vi.mocked(usePathname).mockReturnValue('/lavacar-bh/my-account/bookings/booking-id/cancel');
    const { container } = render(<CustomerBottomNav tenantSlug="lavacar-bh" />);

    expect(container).toBeEmptyDOMElement();
  });

  it('uses the provided tenantSlug in all href values', () => {
    vi.mocked(usePathname).mockReturnValue('/outro-tenant/my-account');
    render(<CustomerBottomNav tenantSlug="outro-tenant" />);

    const nav = screen.getByRole('navigation', { name: 'customer-bottom-nav' });
    expect(nav.querySelector('a[href="/outro-tenant/my-account"]')).toBeInTheDocument();
  });
});

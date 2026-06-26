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
    expect(nav.querySelector('a[href="/lavacar-bh/my-account"]')?.className).toContain('text-blue-600');
  });

  it('marks bookings as active when on a nested bookings route', () => {
    vi.mocked(usePathname).mockReturnValue('/lavacar-bh/my-account/bookings/detail');
    render(<CustomerBottomNav tenantSlug="lavacar-bh" />);

    const nav = screen.getByRole('navigation', { name: 'customer-bottom-nav' });
    expect(nav.querySelector('a[href="/lavacar-bh/my-account/bookings"]')?.className).toContain('text-blue-600');
    expect(nav.querySelector('a[href="/lavacar-bh/my-account"]')?.className).toContain('text-gray-900/40');
  });

  it('uses the provided tenantSlug in all href values', () => {
    render(<CustomerBottomNav tenantSlug="outro-tenant" />);

    const nav = screen.getByRole('navigation', { name: 'customer-bottom-nav' });
    expect(nav.querySelector('a[href="/outro-tenant/my-account"]')).toBeInTheDocument();
  });
});

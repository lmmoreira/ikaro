// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CustomerTabNav } from './CustomerTabNav';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('next/navigation', () => ({
  usePathname: vi.fn().mockReturnValue('/lavacar-bh/my-account'),
}));

import { usePathname } from 'next/navigation';

describe('CustomerTabNav', () => {
  it('renders links for home, bookings, and loyalty', () => {
    render(<CustomerTabNav tenantSlug="lavacar-bh" />);

    const nav = screen.getByRole('navigation', { name: 'customer-tabs' });
    expect(nav.querySelector('a[href="/lavacar-bh/my-account"]')).toBeInTheDocument();
    expect(nav.querySelector('a[href="/lavacar-bh/my-account/bookings"]')).toBeInTheDocument();
    expect(nav.querySelector('a[href="/lavacar-bh/my-account/loyalty"]')).toBeInTheDocument();
  });

  it('marks home as active with exact match on root path', () => {
    vi.mocked(usePathname).mockReturnValue('/lavacar-bh/my-account');
    render(<CustomerTabNav tenantSlug="lavacar-bh" />);

    const nav = screen.getByRole('navigation', { name: 'customer-tabs' });
    expect(nav.querySelector('a[href="/lavacar-bh/my-account"]')?.className).toContain(
      'border-blue-600',
    );
  });

  it('does not mark home as active on a nested route', () => {
    vi.mocked(usePathname).mockReturnValue('/lavacar-bh/my-account/bookings');
    render(<CustomerTabNav tenantSlug="lavacar-bh" />);

    const nav = screen.getByRole('navigation', { name: 'customer-tabs' });
    expect(nav.querySelector('a[href="/lavacar-bh/my-account"]')?.className).toContain(
      'border-transparent',
    );
    expect(nav.querySelector('a[href="/lavacar-bh/my-account/bookings"]')?.className).toContain(
      'border-blue-600',
    );
  });

  it('uses the provided tenantSlug in all href values', () => {
    render(<CustomerTabNav tenantSlug="outro-tenant" />);

    const nav = screen.getByRole('navigation', { name: 'customer-tabs' });
    expect(nav.querySelector('a[href="/outro-tenant/my-account"]')).toBeInTheDocument();
  });
});

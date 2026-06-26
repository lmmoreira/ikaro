// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from '@/axe-helper';
import { HotsiteAuthBar } from './HotsiteAuthBar';

// ── module mocks ──────────────────────────────────────────────────────────────

vi.mock('next/headers', () => ({ cookies: vi.fn() }));
vi.mock('next-intl/server', () => ({ getTranslations: vi.fn() }));
vi.mock('./HotsiteAuthBarDropdown', () => ({
  HotsiteAuthBarDropdown: ({ name, slug }: { name: string; slug: string }) => (
    <div data-testid="hotsite-auth-dropdown" data-name={name} data-slug={slug} />
  ),
}));

import { cookies } from 'next/headers';
import { getTranslations } from 'next-intl/server';

// ── helpers ───────────────────────────────────────────────────────────────────

const TRANSLATIONS: Record<string, string> = {
  signIn: 'Entrar',
  signOut: 'Sair',
  staffArea: 'Área da Equipe',
};

function makeToken(claims: Record<string, unknown>): string {
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `header.${payload}.signature`;
}

function setupCookie(token: string | undefined): void {
  vi.mocked(cookies).mockResolvedValue({
    get: (name: string) =>
      name === 'access_token' && token ? { name: 'access_token', value: token } : undefined,
  } as Awaited<ReturnType<typeof cookies>>);
}

const SLUG = 'lavacar-beloauto';
const futureExp = Math.floor(Date.now() / 1000) + 3600;
const pastExp = Math.floor(Date.now() / 1000) - 60;

const staffToken = makeToken({
  sub: 'staff-uuid',
  tenantId: 't-1',
  tenantSlug: SLUG,
  tenantName: 'Lavacar BH',
  userName: 'Ana Pereira',
  role: 'STAFF',
  exp: futureExp,
});

const managerToken = makeToken({
  sub: 'manager-uuid',
  tenantId: 't-1',
  tenantSlug: SLUG,
  tenantName: 'Lavacar BH',
  userName: 'Carlos Gomes',
  role: 'MANAGER',
  exp: futureExp,
});

const customerToken = makeToken({
  sub: 'customer-uuid',
  tenantId: 't-1',
  tenantSlug: SLUG,
  tenantName: 'Lavacar BH',
  userName: 'João Silva',
  role: 'CUSTOMER',
  exp: futureExp,
});

async function renderBar(slug = SLUG): Promise<ReturnType<typeof render>> {
  const jsx = await HotsiteAuthBar({ slug });
  return render(jsx);
}

// ── setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.mocked(getTranslations).mockResolvedValue(
    ((key: string) => TRANSLATIONS[key] ?? key) as Awaited<ReturnType<typeof getTranslations>>,
  );
});

afterEach(() => {
  vi.clearAllMocks();
  delete process.env.NEXT_PUBLIC_BFF_URL;
});

// ── tests ─────────────────────────────────────────────────────────────────────

describe('HotsiteAuthBar', () => {
  describe('unauthenticated (no cookie)', () => {
    beforeEach(() => setupCookie(undefined));

    it('renders the staff area link pointing to dashboard login', async () => {
      await renderBar();

      const link = screen.getByTestId('hotsite-staff-link');
      expect(link).toHaveAttribute('href', `/dashboard/login?tenantSlug=${SLUG}`);
      expect(link).toHaveTextContent('Área da Equipe');
    });

    it('renders the customer sign-in link pointing to the tenant login page', async () => {
      await renderBar();

      const link = screen.getByTestId('hotsite-login-link');
      expect(link).toHaveAttribute('href', `/${SLUG}/login`);
      expect(link).toHaveTextContent('Entrar');
    });

    it('has no axe violations', async () => {
      const { container } = await renderBar();

      expect(await axe(container)).toHaveNoViolations();
    });
  });

  describe('authenticated as STAFF', () => {
    beforeEach(() => setupCookie(staffToken));

    it('shows a link to /dashboard with the user name', async () => {
      await renderBar();

      const link = screen.getByTestId('hotsite-staff-authenticated-link');
      expect(link).toHaveAttribute('href', '/dashboard');
      expect(link).toHaveTextContent('Ana Pereira');
    });

    it('shows a logout link pointing to the BFF logout route', async () => {
      process.env.NEXT_PUBLIC_BFF_URL = 'http://bff-test:3002/v1';
      await renderBar();

      const link = screen.getByTestId('hotsite-staff-logout-link');
      expect(link).toHaveAttribute(
        'href',
        `http://bff-test:3002/v1/auth/logout?tenantSlug=${SLUG}`,
      );
      expect(link).toHaveTextContent('Sair');
    });

    it('falls back to sub when userName is absent from the token', async () => {
      const noNameToken = makeToken({
        sub: 'staff-uuid',
        tenantId: 't-1',
        tenantSlug: SLUG,
        role: 'STAFF',
        exp: futureExp,
      });
      setupCookie(noNameToken);
      await renderBar();

      const link = screen.getByTestId('hotsite-staff-authenticated-link');
      expect(link).toHaveTextContent('staff-uuid');
    });
  });

  describe('authenticated as MANAGER', () => {
    beforeEach(() => setupCookie(managerToken));

    it('shows a link to /dashboard with the manager name', async () => {
      await renderBar();

      const link = screen.getByTestId('hotsite-staff-authenticated-link');
      expect(link).toHaveAttribute('href', '/dashboard');
      expect(link).toHaveTextContent('Carlos Gomes');
    });
  });

  describe('authenticated as CUSTOMER', () => {
    beforeEach(() => setupCookie(customerToken));

    it('renders HotsiteAuthBarDropdown with the customer name and slug', async () => {
      await renderBar();

      const dropdown = screen.getByTestId('hotsite-auth-dropdown');
      expect(dropdown).toHaveAttribute('data-name', 'João Silva');
      expect(dropdown).toHaveAttribute('data-slug', SLUG);
    });

    it('does not render the "Entrar" sign-in link', async () => {
      await renderBar();

      expect(screen.queryByTestId('hotsite-login-link')).not.toBeInTheDocument();
    });
  });

  describe('expired token', () => {
    it('treats an expired session as unauthenticated', async () => {
      const expiredToken = makeToken({
        sub: 'staff-uuid',
        tenantId: 't-1',
        tenantSlug: SLUG,
        role: 'STAFF',
        exp: pastExp,
      });
      setupCookie(expiredToken);
      await renderBar();

      expect(screen.getByTestId('hotsite-staff-link')).toBeInTheDocument();
      expect(screen.getByTestId('hotsite-login-link')).toBeInTheDocument();
    });
  });

  describe('tenant slug mismatch', () => {
    it('treats a token for a different tenant as unauthenticated', async () => {
      const otherTenantToken = makeToken({
        sub: 'staff-uuid',
        tenantId: 't-2',
        tenantSlug: 'another-tenant',
        role: 'STAFF',
        exp: futureExp,
      });
      setupCookie(otherTenantToken);
      await renderBar();

      expect(screen.getByTestId('hotsite-staff-link')).toBeInTheDocument();
      expect(screen.getByTestId('hotsite-login-link')).toBeInTheDocument();
    });
  });
});

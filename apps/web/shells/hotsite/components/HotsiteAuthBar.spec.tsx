// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from '@/axe-helper';
import { clearPublicEnv, stubPublicEnv } from '@/test-utils';
import { HotsiteAuthBar } from './HotsiteAuthBar';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const map: Record<string, string> = {
      signIn: 'Entrar',
      signOut: 'Sair',
      staffArea: 'Área da Equipe',
    };
    return map[key] ?? key;
  },
}));

vi.mock('./HotsiteAuthBarDropdown', () => ({
  HotsiteAuthBarDropdown: ({ name, slug }: { name: string; slug: string }) => (
    <div data-testid="hotsite-auth-dropdown" data-name={name} data-slug={slug} />
  ),
}));

const SLUG = 'lavacar-beloauto';

function mockSession(session: { staff?: unknown; customer?: unknown }): void {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    if (url.includes('/api/session')) {
      return new Response(
        JSON.stringify({ staff: session.staff ?? null, customer: session.customer ?? null }),
        { status: 200 },
      );
    }
    throw new Error(`Unexpected fetch: ${url}`);
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  clearPublicEnv();
});

describe('HotsiteAuthBar', () => {
  describe('while /api/session is in flight', () => {
    it('renders a loading skeleton instead of the unauthenticated markup', async () => {
      let resolveFetch: (value: Response) => void = () => {};
      vi.spyOn(globalThis, 'fetch').mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveFetch = resolve;
          }),
      );

      render(<HotsiteAuthBar slug={SLUG} />);

      expect(screen.getByTestId('hotsite-auth-bar-skeleton')).toBeInTheDocument();
      expect(screen.queryByTestId('hotsite-login-link')).not.toBeInTheDocument();
      expect(screen.queryByTestId('hotsite-staff-link')).not.toBeInTheDocument();

      resolveFetch(new Response(JSON.stringify({ staff: null, customer: null }), { status: 200 }));

      await screen.findByTestId('hotsite-login-link');
      expect(screen.queryByTestId('hotsite-auth-bar-skeleton')).not.toBeInTheDocument();
    });
  });

  describe('unauthenticated (both staff and customer null)', () => {
    beforeEach(() => mockSession({}));

    it('renders the staff area link pointing to dashboard login', async () => {
      render(<HotsiteAuthBar slug={SLUG} />);

      const link = await screen.findByTestId('hotsite-staff-link');
      expect(link).toHaveAttribute('href', `/dashboard/login?tenantSlug=${SLUG}`);
      expect(link).toHaveTextContent('Área da Equipe');
    });

    it('renders the customer sign-in link pointing to the tenant login page', async () => {
      render(<HotsiteAuthBar slug={SLUG} />);

      const link = await screen.findByTestId('hotsite-login-link');
      expect(link).toHaveAttribute('href', `/${SLUG}/login`);
      expect(link).toHaveTextContent('Entrar');
    });

    it('has no axe violations', async () => {
      const { container } = render(<HotsiteAuthBar slug={SLUG} />);

      await screen.findByTestId('hotsite-login-link');
      expect(await axe(container)).toHaveNoViolations();
    });
  });

  describe('authenticated as staff (STAFF or MANAGER)', () => {
    beforeEach(() => mockSession({ staff: { name: 'Ana Pereira' } }));

    it('shows a link to /dashboard with the staff member name', async () => {
      render(<HotsiteAuthBar slug={SLUG} />);

      const link = await screen.findByTestId('hotsite-staff-authenticated-link');
      expect(link).toHaveAttribute('href', '/dashboard');
      expect(link).toHaveTextContent('Ana Pereira');
    });

    it('shows a logout link pointing to the BFF logout route', async () => {
      stubPublicEnv({ NEXT_PUBLIC_BFF_URL: 'http://bff-test:3002/v1' });
      render(<HotsiteAuthBar slug={SLUG} />);

      const link = await screen.findByTestId('hotsite-staff-logout-link');
      expect(link).toHaveAttribute(
        'href',
        `http://bff-test:3002/v1/auth/logout?tenantSlug=${SLUG}`,
      );
      expect(link).toHaveTextContent('Sair');
    });
  });

  describe('staff session with no name', () => {
    beforeEach(() => mockSession({ staff: { name: null } }));

    it('falls back to the staff-area label', async () => {
      render(<HotsiteAuthBar slug={SLUG} />);

      const link = await screen.findByTestId('hotsite-staff-authenticated-link');
      expect(link).toHaveTextContent('Área da Equipe');
    });
  });

  describe('authenticated as customer', () => {
    beforeEach(() => mockSession({ customer: { name: 'João Silva' } }));

    it('renders HotsiteAuthBarDropdown with the customer name and slug', async () => {
      render(<HotsiteAuthBar slug={SLUG} />);

      const dropdown = await screen.findByTestId('hotsite-auth-dropdown');
      expect(dropdown).toHaveAttribute('data-name', 'João Silva');
      expect(dropdown).toHaveAttribute('data-slug', SLUG);
    });

    it('does not render the "Entrar" sign-in link', async () => {
      render(<HotsiteAuthBar slug={SLUG} />);

      await screen.findByTestId('hotsite-auth-dropdown');
      expect(screen.queryByTestId('hotsite-login-link')).not.toBeInTheDocument();
    });
  });

  describe('network failure', () => {
    beforeEach(() => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network error'));
    });

    it('treats a failed session check as unauthenticated', async () => {
      render(<HotsiteAuthBar slug={SLUG} />);

      await waitFor(() => {
        expect(screen.getByTestId('hotsite-staff-link')).toBeInTheDocument();
      });
      expect(screen.getByTestId('hotsite-login-link')).toBeInTheDocument();
    });
  });
});

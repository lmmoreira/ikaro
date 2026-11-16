// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { axe } from '@/axe-helper';
import { clearPublicEnv, renderWithIntl, stubPublicEnv } from '@/test-utils';
import { ManagerSuspendedNotice } from './ManagerSuspendedNotice';

beforeEach(() => {
  stubPublicEnv({ NEXT_PUBLIC_BFF_URL: 'https://bff.example' });
});

afterEach(() => {
  clearPublicEnv();
});

describe('ManagerSuspendedNotice', () => {
  it('tells the manager the account is suspended and points to the billing area (pt-BR)', async () => {
    const { container } = renderWithIntl(<ManagerSuspendedNotice tenantSlug="lavacar" />);

    expect(screen.getByRole('heading', { name: 'Sua conta está suspensa' })).toBeInTheDocument();
    expect(screen.getByText(/área de assinatura/)).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('renders in English', async () => {
    const { container } = renderWithIntl(<ManagerSuspendedNotice tenantSlug="lavacar" />, {
      locale: 'en',
    });

    expect(screen.getByRole('heading', { name: 'Your account is suspended' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign out' })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it.each(['pt-BR', 'en'] as const)(
    'never tells the manager to talk to the manager nor shows a reason (%s)',
    (locale) => {
      renderWithIntl(<ManagerSuspendedNotice tenantSlug="lavacar" />, { locale });

      const text = screen.getByTestId('manager-suspended-notice').textContent ?? '';
      expect(text).not.toMatch(/fale com o gerente/i);
      expect(text).not.toMatch(/talk to (the|your) manager/i);
      expect(text).not.toMatch(/inadimpl|non[- ]payment|operator|operador/i);
    },
  );

  it('offers a sign-out link for the tenant', () => {
    renderWithIntl(<ManagerSuspendedNotice tenantSlug="lavacar" />);

    expect(screen.getByTestId('manager-suspended-sign-out')).toHaveAttribute(
      'href',
      'https://bff.example/auth/logout?tenantSlug=lavacar',
    );
  });
});

// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'jest-axe';
import { clearPublicEnv, renderWithIntl, stubPublicEnv } from '@/test-utils';
import { StaffSuspendedNotice } from './StaffSuspendedNotice';

beforeEach(() => {
  stubPublicEnv({ NEXT_PUBLIC_BFF_URL: 'https://bff.example' });
});

afterEach(() => {
  clearPublicEnv();
});

describe('StaffSuspendedNotice', () => {
  it('tells the staff member to talk to the manager (pt-BR)', async () => {
    const { container } = renderWithIntl(<StaffSuspendedNotice tenantSlug="lavacar" />);

    expect(screen.getByRole('heading', { name: 'Conta suspensa' })).toBeInTheDocument();
    expect(screen.getByText('Esta conta está suspensa. Fale com o gerente.')).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('renders in English', async () => {
    const { container } = renderWithIntl(<StaffSuspendedNotice tenantSlug="lavacar" />, {
      locale: 'en',
    });

    expect(screen.getByRole('heading', { name: 'Account suspended' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign out' })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it.each(['pt-BR', 'en'] as const)(
    'never shows a reason or billing information (%s)',
    (locale) => {
      renderWithIntl(<StaffSuspendedNotice tenantSlug="lavacar" />, { locale });

      const text = screen.getByTestId('staff-suspended-notice').textContent ?? '';
      expect(text).not.toMatch(
        /inadimpl|non[- ]payment|operator|operador|assinatura|subscription/i,
      );
    },
  );

  it('offers only a sign-out action for the tenant', () => {
    renderWithIntl(<StaffSuspendedNotice tenantSlug="lavacar" />);

    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(screen.getByTestId('staff-suspended-sign-out')).toHaveAttribute(
      'href',
      'https://bff.example/auth/logout?tenantSlug=lavacar',
    );
  });
});

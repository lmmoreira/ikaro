// @vitest-environment jsdom
import { renderWithIntl } from '@/test-utils';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { axe } from '@/axe-helper';
import { LeadFormLoginRequiredGate } from './LeadFormLoginRequiredGate';

describe('LeadFormLoginRequiredGate', () => {
  it('renders the gate copy and links to /[slug]/login with a returnTo pointing back at the lead form', () => {
    renderWithIntl(<LeadFormLoginRequiredGate slug="lavacar-beloauto" />);

    expect(screen.getByText('Entre para responder este formulário')).toBeInTheDocument();
    const cta = screen.getByTestId('lead-form-login-required-cta');
    expect(cta).toHaveAttribute(
      'href',
      '/lavacar-beloauto/login?returnTo=%2Flavacar-beloauto%2Flead-form',
    );
  });

  it('links "Voltar ao site" back to the tenant hotsite home', () => {
    renderWithIntl(<LeadFormLoginRequiredGate slug="lavacar-beloauto" />);

    expect(screen.getByTestId('lead-form-login-required-back')).toHaveAttribute(
      'href',
      '/lavacar-beloauto',
    );
  });

  it('has no accessibility violations', async () => {
    const { container } = renderWithIntl(<LeadFormLoginRequiredGate slug="lavacar-beloauto" />);
    expect(await axe(container)).toHaveNoViolations();
  });
});

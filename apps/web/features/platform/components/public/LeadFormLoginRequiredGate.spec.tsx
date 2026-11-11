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

describe('LeadFormLoginRequiredGate readable colours (TD51-S05)', () => {
  it('shows its title in the branded panel, so the text reads on the secondary colour', () => {
    renderWithIntl(<LeadFormLoginRequiredGate slug="lavacar-beloauto" />);

    const panel = screen.getByText('Entre para responder este formulário').parentElement;
    expect(panel?.style.backgroundColor).toBe('var(--ba-secondary)');
    expect(panel?.style.color).toBe('var(--ba-secondary-text)');
    const body = screen.getByText(/formulário/, { selector: 'p.leading-relaxed' });
    expect(body.className).not.toMatch(/opacity/);
    expect(body.style.color).toBe('var(--ba-secondary-muted, var(--ba-secondary-text))');
  });
});

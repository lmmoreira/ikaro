// @vitest-environment jsdom
import { renderWithIntl } from '@/test-utils';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { axe } from '@/axe-helper';
import { LeadFormSuccess } from './LeadFormSuccess';

describe('LeadFormSuccess', () => {
  it('renders the success banner and a link back to the hotsite home', () => {
    renderWithIntl(<LeadFormSuccess slug="lavacar-beloauto" />);

    expect(screen.getByTestId('lead-form-success')).toBeInTheDocument();
    expect(screen.getByText('Recebemos sua mensagem!')).toBeInTheDocument();
    expect(screen.getByText('Voltar ao site')).toHaveAttribute('href', '/lavacar-beloauto');
  });

  it('has no accessibility violations', async () => {
    const { container } = renderWithIntl(<LeadFormSuccess slug="lavacar-beloauto" />);
    expect(await axe(container)).toHaveNoViolations();
  });
});

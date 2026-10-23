// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { axe } from '@/axe-helper';
import { renderWithIntl } from '@/test-utils';
import { ServiceDetailUnavailable } from './ServiceDetailUnavailable';

describe('ServiceDetailUnavailable', () => {
  it('says the page does not exist and links back to the services', () => {
    renderWithIntl(<ServiceDetailUnavailable slug="vitta" />);

    expect(screen.getByRole('heading', { level: 1, name: 'Página não encontrada' })).toBeVisible();
    expect(screen.getByText('Este serviço não está disponível no momento.')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Ver todos os serviços' })).toHaveAttribute(
      'href',
      '/vitta#service-list',
    );
  });

  it('has no accessibility violations', async () => {
    const { container } = renderWithIntl(<ServiceDetailUnavailable slug="vitta" />);

    expect(await axe(container)).toHaveNoViolations();
  });
});

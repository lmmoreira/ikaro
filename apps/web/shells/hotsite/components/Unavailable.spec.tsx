// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { axe } from '@/axe-helper';
import { renderWithIntl } from '@/test-utils';
import { Unavailable } from './Unavailable';

describe('Unavailable', () => {
  it('renders the reason-neutral pt-BR message', () => {
    renderWithIntl(<Unavailable />);

    expect(screen.getByRole('heading', { name: 'Página indisponível' })).toBeInTheDocument();
    expect(
      screen.getByText('Esta página não está disponível no momento. Volte em breve.'),
    ).toBeInTheDocument();
  });

  it('renders the reason-neutral en message', () => {
    renderWithIntl(<Unavailable />, { locale: 'en' });

    expect(screen.getByRole('heading', { name: 'Page unavailable' })).toBeInTheDocument();
    expect(
      screen.getByText("This page isn't available right now. Please check back soon."),
    ).toBeInTheDocument();
  });

  it('never says why the page is unavailable and no longer reads "Em breve"', () => {
    const { container } = renderWithIntl(<Unavailable />);

    expect(container).not.toHaveTextContent(/suspens|pagamento|cancelament|publicad/i);
    expect(screen.queryByRole('heading', { name: 'Em breve' })).not.toBeInTheDocument();
  });

  it('paints its own --ba-background (hotsite full-page rule)', () => {
    renderWithIntl(<Unavailable />);

    expect(screen.getByRole('main')).toHaveStyle({ backgroundColor: 'var(--ba-background)' });
  });

  it('has no accessibility violations', async () => {
    const { container } = renderWithIntl(<Unavailable />);

    expect(await axe(container)).toHaveNoViolations();
  });
});

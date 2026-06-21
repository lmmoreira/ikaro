// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import { Unavailable } from './Unavailable';

describe('Unavailable', () => {
  it('renders the "Em breve" pt-BR placeholder copy', () => {
    renderWithIntl(<Unavailable />);

    expect(screen.getByRole('heading', { name: 'Em breve' })).toBeInTheDocument();
    expect(
      screen.getByText('Estamos preparando algo especial. Volte em breve!'),
    ).toBeInTheDocument();
  });

  it('renders the "Coming soon" en placeholder copy', () => {
    renderWithIntl(<Unavailable />, { locale: 'en' });

    expect(screen.getByRole('heading', { name: 'Coming soon' })).toBeInTheDocument();
    expect(
      screen.getByText("We're preparing something special. Check back soon!"),
    ).toBeInTheDocument();
  });
});

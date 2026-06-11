// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Unavailable } from './Unavailable';

describe('Unavailable', () => {
  it('renders the "Em breve" pt-BR placeholder copy', () => {
    render(<Unavailable />);

    expect(screen.getByRole('heading', { name: 'Em breve' })).toBeInTheDocument();
    expect(
      screen.getByText('Estamos preparando algo especial. Volte em breve!'),
    ).toBeInTheDocument();
  });
});

// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import HotsiteNotFound, { metadata } from './not-found';

describe('HotsiteNotFound', () => {
  it('renders the "Lavacar não encontrada" pt-BR placeholder copy', () => {
    render(<HotsiteNotFound />);

    expect(screen.getByRole('heading', { name: 'Lavacar não encontrada' })).toBeInTheDocument();
    expect(
      screen.getByText(
        'A lavacar que você está procurando não existe ou não está mais disponível.',
      ),
    ).toBeInTheDocument();
  });

  it('links back to the BeloAuto homepage', () => {
    render(<HotsiteNotFound />);

    expect(screen.getByRole('link', { name: 'Voltar para o BeloAuto' })).toHaveAttribute(
      'href',
      'https://beloauto.com',
    );
  });

  it('exports a pt-BR metadata title', () => {
    expect(metadata.title).toBe('Não encontrado — BeloAuto');
  });
});

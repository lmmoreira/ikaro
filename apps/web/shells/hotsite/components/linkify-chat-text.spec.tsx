// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { linkifyChatText } from './linkify-chat-text';

describe('linkifyChatText', () => {
  it('renders plain text with no URL as a single text node, unchanged', () => {
    render(<div data-testid="out">{linkifyChatText('Olá, como posso ajudar?')}</div>);

    expect(screen.getByTestId('out')).toHaveTextContent('Olá, como posso ajudar?');
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('renders a bare URL as a real clickable link, opening in a new tab safely', () => {
    render(
      <div data-testid="out">
        {linkifyChatText(
          'Você pode reservar pelo nosso site: http://localhost:3000/beloauto/booking',
        )}
      </div>,
    );

    const link = screen.getByRole('link', { name: 'http://localhost:3000/beloauto/booking' });
    expect(link).toHaveAttribute('href', 'http://localhost:3000/beloauto/booking');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('preserves the surrounding text before and after the URL', () => {
    render(
      <div data-testid="out">
        {linkifyChatText('Reserve aqui: https://example.com/x e chegue 10 min antes.')}
      </div>,
    );

    expect(screen.getByTestId('out')).toHaveTextContent(
      'Reserve aqui: https://example.com/x e chegue 10 min antes.',
    );
    expect(screen.getByRole('link', { name: 'https://example.com/x' })).toBeInTheDocument();
  });

  it('renders multiple URLs in the same message as separate links', () => {
    render(
      <div data-testid="out">
        {linkifyChatText('Site: https://example.com/a ou https://example.com/b')}
      </div>,
    );

    expect(screen.getByRole('link', { name: 'https://example.com/a' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'https://example.com/b' })).toBeInTheDocument();
  });

  it('never renders a javascript: URI as a link — the regex requires a literal http(s):// prefix', () => {
    render(<div data-testid="out">{linkifyChatText('Click javascript:alert(1) here')}</div>);

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByTestId('out')).toHaveTextContent('Click javascript:alert(1) here');
  });
});

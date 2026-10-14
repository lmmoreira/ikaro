// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HomeCountTile } from './HomeCountTile';

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...rest
  }: React.PropsWithChildren<{ href: string } & Record<string, unknown>>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

describe('HomeCountTile', () => {
  it('is one link to its page, showing the label and the value', () => {
    render(
      <HomeCountTile
        href="/lavacar/my-account/alerts"
        label="Avisos"
        value="2 ativos"
        valueTestId="home-alerts-value"
        iconBackground="bg-blue-50"
        icon={<svg data-testid="tile-icon" />}
      />,
    );

    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/lavacar/my-account/alerts');
    expect(link).toHaveTextContent('Avisos');
    expect(screen.getByTestId('home-alerts-value')).toHaveTextContent('2 ativos');
    expect(link).toContainElement(screen.getByTestId('tile-icon'));
  });
});

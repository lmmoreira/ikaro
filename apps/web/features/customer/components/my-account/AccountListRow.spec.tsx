// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AccountListRow } from './AccountListRow';

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

describe('AccountListRow', () => {
  it('renders the title as the link, the meta lines and the badge', () => {
    render(
      <ul>
        <AccountListRow
          icon={<span data-testid="icon" />}
          title="Sala Aurora"
          href="/x/my-account/recurring-schedules/1"
          meta={['Toda terça · 10:00–12:00', 'até 11/11/2026']}
          badge={<span>Ativa</span>}
        />
      </ul>,
    );

    expect(screen.getByRole('link', { name: 'Sala Aurora' })).toHaveAttribute(
      'href',
      '/x/my-account/recurring-schedules/1',
    );
    expect(screen.getByText('Toda terça · 10:00–12:00')).toBeInTheDocument();
    expect(screen.getByText('até 11/11/2026')).toBeInTheDocument();
    expect(screen.getByText('Ativa')).toBeInTheDocument();
    expect(screen.getByTestId('icon')).toBeInTheDocument();
  });

  it('renders the inline actions when given', () => {
    render(
      <ul>
        <AccountListRow
          icon={null}
          title="Sala Aurora"
          href="/x"
          meta={[]}
          actions={<button type="button">Renovar</button>}
          badge={null}
        />
      </ul>,
    );

    expect(screen.getByRole('button', { name: 'Renovar' })).toBeInTheDocument();
  });

  it('renders no actions container when none are given', () => {
    const { container } = render(
      <ul>
        <AccountListRow icon={null} title="Sala Aurora" href="/x" meta={[]} badge={null} />
      </ul>,
    );

    expect(container.querySelectorAll('a')).toHaveLength(1);
    expect(container.querySelector('.mt-1\\.5')).toBeNull();
  });
});

// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { useQueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { QueryProvider } from './query-provider';

function Probe(): React.JSX.Element {
  const queryClient = useQueryClient();
  const defaults = queryClient.getDefaultOptions().queries;

  return (
    <div
      data-testid="query-defaults"
      data-stale-time={String(defaults?.staleTime)}
      data-retry={String(defaults?.retry)}
    />
  );
}

describe('QueryProvider', () => {
  it('creates a query client with the dashboard defaults', () => {
    render(
      <QueryProvider>
        <Probe />
      </QueryProvider>,
    );

    expect(screen.getByTestId('query-defaults')).toHaveAttribute('data-stale-time', '30000');
    expect(screen.getByTestId('query-defaults')).toHaveAttribute('data-retry', '1');
  });
});

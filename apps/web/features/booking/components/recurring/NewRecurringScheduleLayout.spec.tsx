// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ActionPane, NewRecurringScheduleLayout } from './NewRecurringScheduleLayout';

describe('NewRecurringScheduleLayout', () => {
  it('renders the content once and the action pane twice: after it on mobile, beside it on desktop', () => {
    render(
      <NewRecurringScheduleLayout testId="screen" pane={<button type="button">Go</button>}>
        <p>content</p>
      </NewRecurringScheduleLayout>,
    );

    expect(screen.getAllByText('content')).toHaveLength(1);
    const mobile = screen.getByTestId('action-pane-mobile');
    const desktop = screen.getByTestId('action-pane-desktop');
    expect(mobile.className).toContain('lg:hidden');
    expect(desktop.className).toContain('hidden');
    expect(within(mobile).getByRole('button', { name: 'Go' })).toBeInTheDocument();
    expect(within(desktop).getByRole('button', { name: 'Go' })).toBeInTheDocument();
  });

  it('puts the aside text above the pane buttons', () => {
    render(
      <ActionPane aside="Nothing is reserved yet.">
        <button type="button">Go</button>
      </ActionPane>,
    );
    expect(screen.getByText('Nothing is reserved yet.')).toBeInTheDocument();
  });
});

// @vitest-environment jsdom
import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { axe } from '@/axe-helper';
import { Tabs, TabsContent, TabsList, TabsTrigger, type TabsVariant } from './tabs';

function renderTabs({
  variant,
  onValueChange,
  forceMount = false,
}: {
  readonly variant?: TabsVariant;
  readonly onValueChange?: (value: string) => void;
  readonly forceMount?: boolean;
} = {}) {
  return render(
    <Tabs defaultValue="one" onValueChange={onValueChange}>
      <TabsList variant={variant} aria-label="Seções">
        <TabsTrigger value="one">Um</TabsTrigger>
        <TabsTrigger value="two">Dois</TabsTrigger>
        <TabsTrigger value="three" disabled>
          Três
        </TabsTrigger>
      </TabsList>
      <TabsContent value="one" forceMount={forceMount || undefined}>
        Painel um
      </TabsContent>
      <TabsContent value="two" forceMount={forceMount || undefined}>
        Painel dois
      </TabsContent>
    </Tabs>,
  );
}

describe('Tabs', () => {
  it('renders a tablist with tabs and marks the default one selected', () => {
    renderTabs();

    expect(screen.getByRole('tablist', { name: 'Seções' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Um' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Dois' })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Painel um');
  });

  it('switches on click and reports the new value (uncontrolled)', async () => {
    const onValueChange = vi.fn();
    const user = userEvent.setup();
    renderTabs({ onValueChange });

    await user.click(screen.getByRole('tab', { name: 'Dois' }));

    expect(onValueChange).toHaveBeenCalledWith('two');
    expect(screen.getByRole('tab', { name: 'Dois' })).toHaveAttribute('aria-selected', 'true');
    await waitFor(() => expect(screen.getByRole('tabpanel')).toHaveTextContent('Painel dois'));
  });

  it('is controllable through value / onValueChange', async () => {
    const user = userEvent.setup();
    function Controlled() {
      const [value, setValue] = useState('two');
      return (
        <Tabs value={value} onValueChange={setValue}>
          <TabsList>
            <TabsTrigger value="one">Um</TabsTrigger>
            <TabsTrigger value="two">Dois</TabsTrigger>
          </TabsList>
        </Tabs>
      );
    }
    render(<Controlled />);

    expect(screen.getByRole('tab', { name: 'Dois' })).toHaveAttribute('aria-selected', 'true');
    await user.click(screen.getByRole('tab', { name: 'Um' }));
    expect(screen.getByRole('tab', { name: 'Um' })).toHaveAttribute('aria-selected', 'true');
  });

  it('moves between tabs with the arrow keys, Home and End, skipping a disabled tab', async () => {
    const user = userEvent.setup();
    renderTabs();

    await user.tab();
    expect(screen.getByRole('tab', { name: 'Um' })).toHaveFocus();

    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Dois' })).toHaveFocus();
    expect(screen.getByRole('tab', { name: 'Dois' })).toHaveAttribute('aria-selected', 'true');

    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Um' })).toHaveFocus();

    await user.keyboard('{End}');
    expect(screen.getByRole('tab', { name: 'Dois' })).toHaveFocus();

    await user.keyboard('{Home}');
    expect(screen.getByRole('tab', { name: 'Um' })).toHaveFocus();
  });

  it('does not select a disabled tab', async () => {
    const user = userEvent.setup();
    renderTabs();

    await user.click(screen.getByRole('tab', { name: 'Três' }));

    expect(screen.getByRole('tab', { name: 'Três' })).toBeDisabled();
    expect(screen.getByRole('tab', { name: 'Um' })).toHaveAttribute('aria-selected', 'true');
  });

  it('unmounts an inactive panel by default', () => {
    renderTabs();

    expect(screen.queryByText('Painel dois')).not.toBeInTheDocument();
  });

  it('keeps an inactive panel mounted but hidden with forceMount', () => {
    renderTabs({ forceMount: true });

    const hidden = screen.getByText('Painel dois', { selector: '[role="tabpanel"]' });
    expect(hidden).toBeInTheDocument();
    expect(hidden).toHaveAttribute('data-state', 'inactive');
    expect(hidden).toHaveClass('data-[state=inactive]:hidden');
  });

  it('applies the underline look by default and the segmented look when asked', () => {
    const { unmount } = renderTabs();
    expect(screen.getByRole('tablist')).toHaveClass('border-b');
    unmount();

    renderTabs({ variant: 'segmented' });
    expect(screen.getByRole('tablist')).toHaveClass('bg-gray-100');
    expect(screen.getByRole('tab', { name: 'Um' })).toHaveClass('flex-1');
  });

  it('lets a caller override the look through className', () => {
    render(
      <Tabs defaultValue="one">
        <TabsList className="overflow-x-auto">
          <TabsTrigger value="one" className="px-2">
            Um
          </TabsTrigger>
        </TabsList>
      </Tabs>,
    );

    expect(screen.getByRole('tablist')).toHaveClass('overflow-x-auto');
    expect(screen.getByRole('tab', { name: 'Um' })).toHaveClass('px-2');
    expect(screen.getByRole('tab', { name: 'Um' })).not.toHaveClass('px-4');
  });

  it('has no accessibility violations', async () => {
    const { container } = renderTabs();

    expect(await axe(container)).toHaveNoViolations();
  });
});

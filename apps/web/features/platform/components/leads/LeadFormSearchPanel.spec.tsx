// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import { LeadFormSearchPanel } from './LeadFormSearchPanel';

const routerPush = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush }),
}));

describe('LeadFormSearchPanel', () => {
  beforeEach(() => {
    routerPush.mockReset();
  });

  it('starts in basic mode with an empty search box by default', () => {
    renderWithIntl(<LeadFormSearchPanel filterOptionLabels={[]} />);

    expect(screen.getByTestId('leads-search-input')).toHaveValue('');
    expect(screen.queryByTestId('leads-advanced-filters')).not.toBeInTheDocument();
  });

  it('starts in advanced mode when initialFilters is non-empty', () => {
    renderWithIntl(
      <LeadFormSearchPanel
        initialFilters={[{ questionLabel: 'Estado civil', value: 'casado' }]}
        filterOptionLabels={['Estado civil']}
      />,
    );

    expect(screen.getByTestId('leads-advanced-filters')).toBeInTheDocument();
    expect(screen.queryByTestId('leads-search-input')).not.toBeInTheDocument();
  });

  it('pre-fills the search box from initialSearch', () => {
    renderWithIntl(<LeadFormSearchPanel initialSearch="carlos" filterOptionLabels={[]} />);

    expect(screen.getByTestId('leads-search-input')).toHaveValue('carlos');
  });

  // No 3-character minimum (M20-S13 implementation, 2026-08-27) — "Aplicar" has no disabled
  // state to guard against beyond an empty box.
  it('enables "Aplicar" for a 1-2 character search term', async () => {
    const user = userEvent.setup();
    renderWithIntl(<LeadFormSearchPanel filterOptionLabels={[]} />);

    await user.type(screen.getByTestId('leads-search-input'), 'ab');

    expect(screen.getByTestId('leads-search-apply')).toBeEnabled();
  });

  it('navigates with a 1-2 character search term on "Aplicar"', async () => {
    const user = userEvent.setup();
    renderWithIntl(<LeadFormSearchPanel filterOptionLabels={[]} />);

    await user.type(screen.getByTestId('leads-search-input'), 'ab');
    await user.click(screen.getByTestId('leads-search-apply'));

    expect(routerPush).toHaveBeenCalledWith('/dashboard/leads?search=ab');
  });

  it('enables "Aplicar" for an empty search box (equivalent to no search active)', () => {
    renderWithIntl(<LeadFormSearchPanel filterOptionLabels={[]} />);

    expect(screen.getByTestId('leads-search-apply')).toBeEnabled();
  });

  it('navigates with the trimmed search term on "Aplicar"', async () => {
    const user = userEvent.setup();
    renderWithIntl(<LeadFormSearchPanel filterOptionLabels={[]} />);

    await user.type(screen.getByTestId('leads-search-input'), '  carlos  ');
    await user.click(screen.getByTestId('leads-search-apply'));

    expect(routerPush).toHaveBeenCalledWith('/dashboard/leads?search=carlos');
  });

  it('"Limpar" resets the search box and date range and navigates to the unfiltered list', async () => {
    const user = userEvent.setup();
    renderWithIntl(<LeadFormSearchPanel initialSearch="carlos" filterOptionLabels={[]} />);

    await user.click(screen.getByTestId('leads-search-clear'));

    expect(routerPush).toHaveBeenCalledWith('/dashboard/leads');
    expect(screen.getByTestId('leads-search-input')).toHaveValue('');
  });

  it('"Limpar" stays in basic mode', async () => {
    const user = userEvent.setup();
    renderWithIntl(<LeadFormSearchPanel initialSearch="carlos" filterOptionLabels={[]} />);

    await user.click(screen.getByTestId('leads-search-clear'));

    expect(screen.getByTestId('leads-search-input')).toBeInTheDocument();
  });

  it('switches to advanced mode and drops an active search term from the URL', async () => {
    const user = userEvent.setup();
    renderWithIntl(<LeadFormSearchPanel initialSearch="carlos" filterOptionLabels={[]} />);

    await user.click(screen.getByTestId('leads-mode-toggle'));

    expect(routerPush).toHaveBeenCalledWith('/dashboard/leads');
    expect(screen.getByTestId('leads-advanced-filters')).toBeInTheDocument();
  });

  // router.push is a soft App Router navigation that keeps this client component mounted — its
  // own useState doesn't get reset just because the URL/list moved on. Toggling modes must reset
  // the local state too, not just the URL (Codex PR #436 round 1 finding, 2026-08-27).
  it("clears the search box's own state after switching away and back to basic mode", async () => {
    const user = userEvent.setup();
    renderWithIntl(<LeadFormSearchPanel initialSearch="carlos" filterOptionLabels={[]} />);

    await user.click(screen.getByTestId('leads-mode-toggle'));
    await user.click(screen.getByTestId('leads-mode-toggle'));

    expect(screen.getByTestId('leads-search-input')).toHaveValue('');
  });

  it("clears the filter rows' own state after switching away and back to advanced mode", async () => {
    const user = userEvent.setup();
    renderWithIntl(
      <LeadFormSearchPanel
        initialFilters={[{ questionLabel: 'Estado civil', value: 'casado' }]}
        filterOptionLabels={['Estado civil']}
      />,
    );

    await user.click(screen.getByTestId('leads-mode-toggle'));
    await user.click(screen.getByTestId('leads-mode-toggle'));

    expect(screen.getByTestId('leads-filter-row-value')).toHaveValue('');
  });

  it('switches back to basic mode and drops active filters from the URL', async () => {
    const user = userEvent.setup();
    renderWithIntl(
      <LeadFormSearchPanel
        initialFilters={[{ questionLabel: 'Estado civil', value: 'casado' }]}
        filterOptionLabels={['Estado civil']}
      />,
    );

    await user.click(screen.getByTestId('leads-mode-toggle'));

    expect(routerPush).toHaveBeenCalledWith('/dashboard/leads');
    expect(screen.getByTestId('leads-search-input')).toBeInTheDocument();
  });

  it('does not clear an active date range when switching modes', async () => {
    const user = userEvent.setup();
    renderWithIntl(
      <LeadFormSearchPanel
        initialSearch="carlos"
        initialFrom="2026-08-01"
        initialTo="2026-08-15"
        filterOptionLabels={[]}
      />,
    );

    await user.click(screen.getByTestId('leads-mode-toggle'));

    expect(routerPush).toHaveBeenCalledWith(
      '/dashboard/leads?submittedFrom=2026-08-01&submittedTo=2026-08-15',
    );
  });

  it('sends the correctly-shaped filters array on "Aplicar filtros"', async () => {
    const user = userEvent.setup();
    renderWithIntl(
      <LeadFormSearchPanel filterOptionLabels={['Estado civil']} initialFilters={undefined} />,
    );

    await user.click(screen.getByTestId('leads-mode-toggle'));
    routerPush.mockReset();

    await user.click(screen.getByTestId('leads-filter-row-question'));
    await user.click(await screen.findByText('Estado civil'));
    await user.type(screen.getByTestId('leads-filter-row-value'), 'casado');
    await user.click(screen.getByTestId('leads-filters-apply'));

    const filters = [{ questionLabel: 'Estado civil', value: 'casado' }];
    const expectedQuery = new URLSearchParams({ filters: JSON.stringify(filters) }).toString();
    expect(routerPush).toHaveBeenCalledWith(`/dashboard/leads?${expectedQuery}`);
  });

  // No 3-character minimum (M20-S13 implementation, 2026-08-27) — "Aplicar filtros" has no
  // disabled state to guard against beyond every row being empty.
  it('enables "Aplicar filtros" while a row holds a 1-2 character value', () => {
    renderWithIntl(
      <LeadFormSearchPanel
        initialFilters={[{ questionLabel: 'Estado civil', value: 'ca' }]}
        filterOptionLabels={['Estado civil']}
      />,
    );

    expect(screen.getByTestId('leads-filters-apply')).toBeEnabled();
  });

  // A half-filled row (only one side populated) would otherwise be silently dropped from the
  // request with no explanation for why the result doesn't match what was typed (Codex PR #436
  // round 1 finding, 2026-08-27).
  it('disables "Aplicar filtros" when a row has a value but no selected question', () => {
    renderWithIntl(
      <LeadFormSearchPanel
        initialFilters={[{ questionLabel: '', value: 'casado' }]}
        filterOptionLabels={['Estado civil']}
      />,
    );

    expect(screen.getByTestId('leads-filters-apply')).toBeDisabled();
  });

  it('disables "Aplicar filtros" when a row has a selected question but no value', () => {
    renderWithIntl(
      <LeadFormSearchPanel
        initialFilters={[{ questionLabel: 'Estado civil', value: '' }]}
        filterOptionLabels={['Estado civil']}
      />,
    );

    expect(screen.getByTestId('leads-filters-apply')).toBeDisabled();
  });

  it('enables "Aplicar filtros" when every row is either fully filled or fully empty', () => {
    renderWithIntl(
      <LeadFormSearchPanel
        initialFilters={[{ questionLabel: 'Estado civil', value: 'casado' }]}
        filterOptionLabels={['Estado civil']}
      />,
    );

    expect(screen.getByTestId('leads-filters-apply')).toBeEnabled();
  });

  it('"Limpar filtros" resets the rows and date range, stays in advanced mode', async () => {
    const user = userEvent.setup();
    renderWithIntl(
      <LeadFormSearchPanel
        initialFilters={[{ questionLabel: 'Estado civil', value: 'casado' }]}
        filterOptionLabels={['Estado civil']}
      />,
    );

    await user.click(screen.getByTestId('leads-filters-clear'));

    expect(routerPush).toHaveBeenCalledWith('/dashboard/leads');
    expect(screen.getByTestId('leads-advanced-filters')).toBeInTheDocument();
    expect(screen.getByTestId('leads-filter-row-value')).toHaveValue('');
  });
});

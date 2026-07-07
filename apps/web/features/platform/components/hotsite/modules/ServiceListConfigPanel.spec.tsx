// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ServiceListModuleData } from '@ikaro/types';
import { renderWithIntl } from '@/test-utils';
import { ServiceListConfigPanel } from './ServiceListConfigPanel';
import { writeModuleData } from './module-config-panel.types';

const SERVICE_LIST: ServiceListModuleData = { showPrices: true, showPoints: true, layout: 'grid' };

describe('ServiceListConfigPanel', () => {
  it('renders current values', () => {
    renderWithIntl(
      <ServiceListConfigPanel data={writeModuleData(SERVICE_LIST)} onChange={vi.fn()} />,
    );

    expect(screen.getByTestId('service-list-show-prices')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('service-list-layout-grid')).toHaveAttribute('aria-checked', 'true');
  });

  it('toggling showPrices calls onChange with only that field flipped', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    renderWithIntl(
      <ServiceListConfigPanel data={writeModuleData(SERVICE_LIST)} onChange={onChange} />,
    );

    await user.click(screen.getByTestId('service-list-show-prices'));

    expect(onChange).toHaveBeenCalledWith(writeModuleData({ ...SERVICE_LIST, showPrices: false }));
  });

  it('changing the layout pill calls onChange with the new layout', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    renderWithIntl(
      <ServiceListConfigPanel data={writeModuleData(SERVICE_LIST)} onChange={onChange} />,
    );

    await user.click(screen.getByTestId('service-list-layout-list'));

    expect(onChange).toHaveBeenCalledWith(writeModuleData({ ...SERVICE_LIST, layout: 'list' }));
  });
});

// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ServiceListModuleData } from '@ikaro/types';
import { getPillOption, renderWithIntl } from '@/test-utils';
import { ServiceListConfigPanel } from './ServiceListConfigPanel';
import { writeModuleData } from './module-config-panel.types';

const SERVICE_LIST: ServiceListModuleData = { showPrices: true, showPoints: true, layout: 'grid' };

describe('ServiceListConfigPanel', () => {
  it('renders current values', () => {
    renderWithIntl(
      <ServiceListConfigPanel data={writeModuleData(SERVICE_LIST)} onChange={vi.fn()} />,
    );

    expect(screen.getByTestId('service-list-show-prices')).toHaveAttribute('aria-checked', 'true');
    expect(getPillOption('service-list-layout', 'grid')).toHaveAttribute('aria-checked', 'true');
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

    await user.click(getPillOption('service-list-layout', 'list'));

    expect(onChange).toHaveBeenCalledWith(writeModuleData({ ...SERVICE_LIST, layout: 'list' }));
  });

  it('editing title and eyebrow, and toggling showPoints, each update only their own field', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    renderWithIntl(
      <ServiceListConfigPanel data={writeModuleData(SERVICE_LIST)} onChange={onChange} />,
    );

    await user.type(screen.getByLabelText('Título (opcional)'), 'T');
    expect(onChange).toHaveBeenLastCalledWith(writeModuleData({ ...SERVICE_LIST, title: 'T' }));

    await user.type(screen.getByLabelText('Texto de destaque (opcional)'), 'E');
    expect(onChange).toHaveBeenLastCalledWith(writeModuleData({ ...SERVICE_LIST, eyebrow: 'E' }));

    await user.click(screen.getByTestId('service-list-show-points'));
    expect(onChange).toHaveBeenLastCalledWith(
      writeModuleData({ ...SERVICE_LIST, showPoints: false }),
    );
  });

  it.each(['numbered', 'feature-cards'] as const)('offers the %s layout', async (layout) => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithIntl(
      <ServiceListConfigPanel data={writeModuleData(SERVICE_LIST)} onChange={onChange} />,
    );

    await user.click(getPillOption('service-list-layout', layout));

    expect(onChange).toHaveBeenCalledWith(writeModuleData({ ...SERVICE_LIST, layout }));
  });

  it('feature-cards exposes columns and a plain/tinted tone', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const data = writeModuleData({ ...SERVICE_LIST, layout: 'feature-cards' });
    renderWithIntl(<ServiceListConfigPanel data={data} onChange={onChange} />);

    await user.click(getPillOption('service-list-card-columns', '3'));
    expect(onChange).toHaveBeenLastCalledWith(
      writeModuleData({ ...SERVICE_LIST, layout: 'feature-cards', cardColumns: 3 }),
    );

    await user.click(getPillOption('service-list-card-tone', 'tinted'));
    expect(onChange).toHaveBeenLastCalledWith(
      writeModuleData({ ...SERVICE_LIST, layout: 'feature-cards', cardTone: 'tinted' }),
    );
  });

  it('grid exposes the ruled tone and no column control', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithIntl(
      <ServiceListConfigPanel data={writeModuleData(SERVICE_LIST)} onChange={onChange} />,
    );

    expect(screen.queryByTestId('service-list-card-columns')).not.toBeInTheDocument();

    await user.click(getPillOption('service-list-card-tone', 'ruled'));
    expect(onChange).toHaveBeenLastCalledWith(
      writeModuleData({ ...SERVICE_LIST, cardTone: 'ruled' }),
    );
  });

  it('list and numbered layouts expose no card controls', () => {
    renderWithIntl(
      <ServiceListConfigPanel
        data={writeModuleData({ ...SERVICE_LIST, layout: 'list' })}
        onChange={vi.fn()}
      />,
    );

    expect(screen.queryByTestId('service-list-card-tone')).not.toBeInTheDocument();
  });
});

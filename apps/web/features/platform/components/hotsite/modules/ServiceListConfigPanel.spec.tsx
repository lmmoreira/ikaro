// @vitest-environment jsdom
import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ServiceListModuleData } from '@ikaro/types';
import { getPillOption, renderWithIntl } from '@/test-utils';
import { ServiceListConfigPanel } from './ServiceListConfigPanel';
import { writeModuleData } from './module-config-panel.types';

const SERVICE_LIST: ServiceListModuleData = { showPrices: true, showPoints: true, layout: 'grid' };

describe('ServiceListConfigPanel', () => {
  describe('what a card does (itemAction)', () => {
    it('reads an omitted action as Nothing', () => {
      renderWithIntl(
        <ServiceListConfigPanel data={writeModuleData(SERVICE_LIST)} onChange={vi.fn()} />,
      );

      expect(getPillOption('service-list-item-action', 'none')).toHaveAttribute(
        'aria-checked',
        'true',
      );
    });

    it.each(['booking', 'details'] as const)('picking %s writes it', async (itemAction) => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      renderWithIntl(
        <ServiceListConfigPanel data={writeModuleData(SERVICE_LIST)} onChange={onChange} />,
      );

      await user.click(getPillOption('service-list-item-action', itemAction));

      expect(onChange).toHaveBeenLastCalledWith(writeModuleData({ ...SERVICE_LIST, itemAction }));
    });

    it('explains the booking fallback only for the service page action', () => {
      const { rerender } = renderWithIntl(
        <ServiceListConfigPanel
          data={writeModuleData({ ...SERVICE_LIST, itemAction: 'details' })}
          onChange={vi.fn()}
        />,
      );
      expect(screen.getByTestId('service-list-details-fallback')).toBeInTheDocument();

      rerender(
        <ServiceListConfigPanel
          data={writeModuleData({ ...SERVICE_LIST, itemAction: 'booking' })}
          onChange={vi.fn()}
        />,
      );
      expect(screen.queryByTestId('service-list-details-fallback')).not.toBeInTheDocument();
    });

    // Negative guarantee: a card with no action has no button, so there is no label to edit.
    it('offers the card button label only when the card has an action', () => {
      const { rerender } = renderWithIntl(
        <ServiceListConfigPanel data={writeModuleData(SERVICE_LIST)} onChange={vi.fn()} />,
      );
      expect(screen.queryByLabelText('Texto do botão do card (opcional)')).not.toBeInTheDocument();

      rerender(
        <ServiceListConfigPanel
          data={writeModuleData({ ...SERVICE_LIST, itemAction: 'details' })}
          onChange={vi.fn()}
        />,
      );
      expect(screen.getByLabelText('Texto do botão do card (opcional)')).toHaveAttribute(
        'maxlength',
        '40',
      );
    });

    it('writes the card button label, and removes the key when it is cleared', () => {
      const onChange = vi.fn();
      renderWithIntl(
        <ServiceListConfigPanel
          data={writeModuleData({ ...SERVICE_LIST, itemAction: 'details', itemCtaLabel: 'Ver' })}
          onChange={onChange}
        />,
      );

      fireEvent.change(screen.getByLabelText('Texto do botão do card (opcional)'), {
        target: { value: '' },
      });

      const [next] = onChange.mock.lastCall as [Record<string, unknown>];
      expect(next).not.toHaveProperty('itemCtaLabel');
      expect(next.itemAction).toBe('details');
    });
  });

  describe('service pages (detailPage)', () => {
    const DEFAULTS = {
      heroStyle: 'cover',
      galleryLayout: 'grid',
      showPrice: true,
      showDuration: true,
      showLoyaltyPoints: true,
    };

    it('shows the renderer defaults while the module sets none', () => {
      renderWithIntl(
        <ServiceListConfigPanel data={writeModuleData(SERVICE_LIST)} onChange={vi.fn()} />,
      );

      expect(getPillOption('service-list-detail-hero-style', 'cover')).toHaveAttribute(
        'aria-checked',
        'true',
      );
      expect(getPillOption('service-list-detail-gallery-layout', 'grid')).toHaveAttribute(
        'aria-checked',
        'true',
      );
      expect(screen.getByTestId('service-list-detail-show-price')).toHaveAttribute(
        'aria-checked',
        'true',
      );
    });

    it('writes the whole object, starting from the defaults, on the first change', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      renderWithIntl(
        <ServiceListConfigPanel data={writeModuleData(SERVICE_LIST)} onChange={onChange} />,
      );

      await user.click(getPillOption('service-list-detail-hero-style', 'compact'));

      expect(onChange).toHaveBeenLastCalledWith(
        writeModuleData({ ...SERVICE_LIST, detailPage: { ...DEFAULTS, heroStyle: 'compact' } }),
      );
    });

    it.each([
      ['service-list-detail-show-price', 'showPrice'],
      ['service-list-detail-show-duration', 'showDuration'],
      ['service-list-detail-show-points', 'showLoyaltyPoints'],
    ] as const)('the %s switch toggles %s alone', async (testId, key) => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      renderWithIntl(
        <ServiceListConfigPanel
          data={writeModuleData({ ...SERVICE_LIST, detailPage: DEFAULTS })}
          onChange={onChange}
        />,
      );

      await user.click(screen.getByTestId(testId));

      expect(onChange).toHaveBeenLastCalledWith(
        writeModuleData({ ...SERVICE_LIST, detailPage: { ...DEFAULTS, [key]: false } }),
      );
    });

    it('picks the photo layout', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      renderWithIntl(
        <ServiceListConfigPanel
          data={writeModuleData({ ...SERVICE_LIST, detailPage: DEFAULTS })}
          onChange={onChange}
        />,
      );

      await user.click(getPillOption('service-list-detail-gallery-layout', 'featured'));

      expect(onChange).toHaveBeenLastCalledWith(
        writeModuleData({
          ...SERVICE_LIST,
          detailPage: { ...DEFAULTS, galleryLayout: 'featured' },
        }),
      );
    });

    // Negative guarantee: the detailPage object is a strict shape; an emptied optional label must
    // be removed, not stored as ''.
    it('writes the booking button label (max 40) and removes the key when cleared', () => {
      const onChange = vi.fn();
      renderWithIntl(
        <ServiceListConfigPanel
          data={writeModuleData({
            ...SERVICE_LIST,
            detailPage: { ...DEFAULTS, bookingCtaLabel: 'Reservar' },
          })}
          onChange={onChange}
        />,
      );
      const field = screen.getByLabelText('Texto do botão de agendamento (opcional)');
      expect(field).toHaveAttribute('maxlength', '40');

      fireEvent.change(field, { target: { value: '' } });

      expect(onChange).toHaveBeenLastCalledWith(
        writeModuleData({ ...SERVICE_LIST, detailPage: DEFAULTS }),
      );
    });
  });

  it('tells the manager that clearing the title hides the heading', () => {
    renderWithIntl(
      <ServiceListConfigPanel data={writeModuleData(SERVICE_LIST)} onChange={vi.fn()} />,
    );

    expect(screen.getByText('Apague o texto para ocultar este título.')).toBeInTheDocument();
  });

  it('keeps the section presentation when a field changes', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithIntl(
      <ServiceListConfigPanel
        data={writeModuleData({ ...SERVICE_LIST, presentation: { surface: 'primary' } })}
        onChange={onChange}
      />,
    );

    await user.click(getPillOption('service-list-item-action', 'booking'));

    expect(onChange).toHaveBeenLastCalledWith(
      writeModuleData({
        ...SERVICE_LIST,
        itemAction: 'booking',
        presentation: { surface: 'primary' },
      }),
    );
  });

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

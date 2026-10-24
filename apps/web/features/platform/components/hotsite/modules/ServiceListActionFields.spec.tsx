// @vitest-environment jsdom
import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ServiceListModuleData } from '@ikaro/types';
import { getPillOption, renderWithIntl } from '@/test-utils';
import { ServiceListActionFields } from './ServiceListActionFields';

const BASE: ServiceListModuleData = { showPrices: true, showPoints: true, layout: 'grid' };
const DEFAULTS = {
  heroStyle: 'cover',
  galleryLayout: 'grid',
  showPrice: true,
  showDuration: true,
  showLoyaltyPoints: true,
};

function renderFields(serviceList: ServiceListModuleData = BASE) {
  const update = vi.fn();
  renderWithIntl(<ServiceListActionFields serviceList={serviceList} update={update} />);
  return update;
}

describe('ServiceListActionFields', () => {
  it('reads an omitted action as Nada and picks another', async () => {
    const user = userEvent.setup();
    const update = renderFields();
    expect(getPillOption('service-list-item-action', 'none')).toHaveAttribute(
      'aria-checked',
      'true',
    );

    await user.click(getPillOption('service-list-item-action', 'details'));

    expect(update).toHaveBeenLastCalledWith({ itemAction: 'details' });
  });

  it('explains the booking fallback only for the service page action', () => {
    const { unmount } = renderWithIntl(
      <ServiceListActionFields serviceList={{ ...BASE, itemAction: 'details' }} update={vi.fn()} />,
    );
    expect(screen.getByTestId('service-list-details-fallback')).toBeInTheDocument();
    unmount();

    renderFields({ ...BASE, itemAction: 'booking' });
    expect(screen.queryByTestId('service-list-details-fallback')).not.toBeInTheDocument();
  });

  // Negative guarantee: a card with no action has no button to label.
  it('offers the card button label only when the card has an action', () => {
    const { unmount } = renderWithIntl(
      <ServiceListActionFields serviceList={BASE} update={vi.fn()} />,
    );
    expect(screen.queryByLabelText('Texto do botão do card (opcional)')).not.toBeInTheDocument();
    unmount();

    renderFields({ ...BASE, itemAction: 'booking' });
    expect(screen.getByLabelText('Texto do botão do card (opcional)')).toHaveAttribute(
      'maxlength',
      '40',
    );
  });

  it('writes the card label and clears it to undefined', () => {
    const update = renderFields({ ...BASE, itemAction: 'details', itemCtaLabel: 'Ver' });
    const field = screen.getByLabelText('Texto do botão do card (opcional)');

    fireEvent.change(field, { target: { value: 'Saiba mais' } });
    expect(update).toHaveBeenLastCalledWith({ itemCtaLabel: 'Saiba mais' });

    fireEvent.change(field, { target: { value: '' } });
    expect(update).toHaveBeenLastCalledWith({ itemCtaLabel: undefined });
  });

  it('shows the renderer defaults and writes the whole detail object from them on first change', async () => {
    const user = userEvent.setup();
    const update = renderFields();
    expect(getPillOption('service-list-detail-hero-style', 'cover')).toHaveAttribute(
      'aria-checked',
      'true',
    );

    await user.click(getPillOption('service-list-detail-hero-style', 'compact'));

    expect(update).toHaveBeenLastCalledWith({ detailPage: { ...DEFAULTS, heroStyle: 'compact' } });
  });

  it('toggles each visibility switch alone', async () => {
    const user = userEvent.setup();
    const update = renderFields({ ...BASE, detailPage: DEFAULTS as never });

    await user.click(screen.getByTestId('service-list-detail-show-duration'));

    expect(update).toHaveBeenLastCalledWith({ detailPage: { ...DEFAULTS, showDuration: false } });
  });

  it('writes the booking button label and drops the key when it is cleared', () => {
    const update = renderFields({
      ...BASE,
      detailPage: { ...DEFAULTS, bookingCtaLabel: 'Reservar' } as never,
    });
    const field = screen.getByLabelText('Texto do botão de agendamento (opcional)');

    fireEvent.change(field, { target: { value: '' } });

    expect(update).toHaveBeenLastCalledWith({ detailPage: DEFAULTS });
  });
});

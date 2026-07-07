// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ContactModuleData } from '@ikaro/types';
import { renderWithIntl } from '@/test-utils';
import { ContactConfigPanel } from './ContactConfigPanel';
import { writeModuleData } from './module-config-panel.types';

const CONTACT: ContactModuleData = {
  showAddress: true,
  showPhone: true,
  showWhatsapp: true,
  showEmail: true,
  showMap: true,
};

describe('ContactConfigPanel', () => {
  it('renders current values, defaulting showInstagram/showFacebook to true when absent', () => {
    renderWithIntl(<ContactConfigPanel data={writeModuleData(CONTACT)} onChange={vi.fn()} />);

    expect(screen.getByTestId('contact-show-address')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('contact-show-instagram')).toHaveAttribute('aria-checked', 'true');
  });

  it('toggling showMap calls onChange with only that field flipped', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    renderWithIntl(<ContactConfigPanel data={writeModuleData(CONTACT)} onChange={onChange} />);

    await user.click(screen.getByTestId('contact-show-map'));

    expect(onChange).toHaveBeenCalledWith(writeModuleData({ ...CONTACT, showMap: false }));
  });

  it('changing the display style pill calls onChange with the new style', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    renderWithIntl(<ContactConfigPanel data={writeModuleData(CONTACT)} onChange={onChange} />);

    await user.click(screen.getByTestId('contact-display-style-icon-cards'));

    expect(onChange).toHaveBeenCalledWith(
      writeModuleData({ ...CONTACT, displayStyle: 'icon-cards' }),
    );
  });
});

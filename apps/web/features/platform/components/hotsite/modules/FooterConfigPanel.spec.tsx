// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { FooterModuleData } from '@ikaro/types';
import { renderWithIntl } from '@/test-utils';
import { FooterConfigPanel } from './FooterConfigPanel';
import { writeModuleData } from './module-config-panel.types';

const FOOTER: FooterModuleData = {};

describe('FooterConfigPanel', () => {
  it('renders with all fields empty/defaulted when data is {}', () => {
    renderWithIntl(<FooterConfigPanel data={writeModuleData(FOOTER)} onChange={vi.fn()} />);

    expect(screen.getByTestId('footer-show-whatsapp')).toHaveAttribute('aria-checked', 'true');
  });

  it('editing the tagline calls onChange with only that field updated', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    renderWithIntl(<FooterConfigPanel data={writeModuleData(FOOTER)} onChange={onChange} />);

    await user.type(screen.getByLabelText('Slogan (opcional)'), 'X');

    expect(onChange).toHaveBeenLastCalledWith(writeModuleData({ ...FOOTER, tagline: 'X' }));
  });

  it('toggling showWhatsapp calls onChange with the flipped value', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    renderWithIntl(<FooterConfigPanel data={writeModuleData(FOOTER)} onChange={onChange} />);

    await user.click(screen.getByTestId('footer-show-whatsapp'));

    expect(onChange).toHaveBeenCalledWith(writeModuleData({ ...FOOTER, showWhatsapp: false }));
  });
});

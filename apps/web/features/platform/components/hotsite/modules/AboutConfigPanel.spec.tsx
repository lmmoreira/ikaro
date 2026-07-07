// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { AboutModuleData } from '@ikaro/types';
import { renderWithIntl } from '@/test-utils';
import { AboutConfigPanel } from './AboutConfigPanel';
import { writeModuleData } from './module-config-panel.types';

vi.mock('@/features/platform/tenant-settings', () => ({
  generateHotsiteImageSignedUrl: vi.fn(),
  deleteHotsiteImage: vi.fn(),
}));

const ABOUT: AboutModuleData = { title: 'Sobre nós', body: 'Texto', imagePosition: 'left' };

describe('AboutConfigPanel', () => {
  it('renders current values', () => {
    renderWithIntl(<AboutConfigPanel data={writeModuleData(ABOUT)} onChange={vi.fn()} />);

    expect(screen.getByDisplayValue('Sobre nós')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Texto')).toBeInTheDocument();
  });

  it('editing the body textarea calls onChange with only that field updated', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    renderWithIntl(<AboutConfigPanel data={writeModuleData(ABOUT)} onChange={onChange} />);

    await user.type(screen.getByLabelText('Texto *'), 'X');

    expect(onChange).toHaveBeenLastCalledWith(writeModuleData({ ...ABOUT, body: 'TextoX' }));
  });

  it('changing the image position pill calls onChange with the new position', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    renderWithIntl(<AboutConfigPanel data={writeModuleData(ABOUT)} onChange={onChange} />);

    await user.click(screen.getByTestId('about-image-position-right'));

    expect(onChange).toHaveBeenCalledWith(writeModuleData({ ...ABOUT, imagePosition: 'right' }));
  });
});

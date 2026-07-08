// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { AboutModuleData } from '@ikaro/types';
import { renderWithIntl } from '@/test-utils';
import { AboutConfigPanel } from './AboutConfigPanel';
import { writeModuleData } from './module-config-panel.types';
import { generateHotsiteImageSignedUrl } from '@/features/platform/tenant-settings';

vi.mock('@/features/platform/tenant-settings', () => ({
  generateHotsiteImageSignedUrl: vi.fn(),
  deleteHotsiteImage: vi.fn(),
}));

function makeFile(name: string, type: string): File {
  return new File(['fake-image-content'], name, { type });
}

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

  it('editing title and eyebrow each update only their own field', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    renderWithIntl(<AboutConfigPanel data={writeModuleData(ABOUT)} onChange={onChange} />);

    await user.type(screen.getByLabelText('Título *'), 'X');
    expect(onChange).toHaveBeenLastCalledWith(writeModuleData({ ...ABOUT, title: 'Sobre nósX' }));

    await user.type(screen.getByLabelText('Texto de destaque (opcional)'), 'E');
    expect(onChange).toHaveBeenLastCalledWith(writeModuleData({ ...ABOUT, eyebrow: 'E' }));
  });

  it('uploading an image calls onChange with the resulting filePath', async () => {
    const user = userEvent.setup();
    vi.mocked(generateHotsiteImageSignedUrl).mockResolvedValue({
      signedUrl: 'https://storage.example.com/upload?sig=abc',
      filePath: 'tenants/tenant-1/hotsite/about/photo.png',
      expiresAt: '2026-06-15T12:00:00.000Z',
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 200 }));
    const onChange = vi.fn();

    renderWithIntl(<AboutConfigPanel data={writeModuleData(ABOUT)} onChange={onChange} />);

    await user.upload(
      screen.getByTestId('single-image-upload-input'),
      makeFile('photo.png', 'image/png'),
    );

    expect(onChange).toHaveBeenLastCalledWith(
      writeModuleData({ ...ABOUT, imageUrl: 'tenants/tenant-1/hotsite/about/photo.png' }),
    );
  });
});

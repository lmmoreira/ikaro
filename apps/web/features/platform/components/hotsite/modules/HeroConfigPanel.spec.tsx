// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { HeroModuleData } from '@ikaro/types';
import { renderWithIntl } from '@/test-utils';
import { HeroConfigPanel } from './HeroConfigPanel';
import { writeModuleData } from './module-config-panel.types';

vi.mock('@/features/platform/tenant-settings', () => ({
  generateHotsiteImageSignedUrl: vi.fn(),
  deleteHotsiteImage: vi.fn(),
}));

const HERO: HeroModuleData = {
  variant: 'centered',
  title: 'Bem-vindo',
  ctaLabel: 'Agendar agora',
  ctaTarget: 'booking-form',
};

describe('HeroConfigPanel', () => {
  it('renders current values', () => {
    renderWithIntl(<HeroConfigPanel data={writeModuleData(HERO)} onChange={vi.fn()} />);

    expect(screen.getByDisplayValue('Bem-vindo')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Agendar agora')).toBeInTheDocument();
  });

  it('editing the title calls onChange with only that field updated', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    renderWithIntl(<HeroConfigPanel data={writeModuleData(HERO)} onChange={onChange} />);

    await user.type(screen.getByLabelText('Título *'), 'X');

    expect(onChange).toHaveBeenLastCalledWith(writeModuleData({ ...HERO, title: 'Bem-vindoX' }));
  });

  it('changing the layout pill calls onChange with the new variant', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    renderWithIntl(<HeroConfigPanel data={writeModuleData(HERO)} onChange={onChange} />);

    await user.click(screen.getByTestId('hero-variant-left-aligned'));

    expect(onChange).toHaveBeenCalledWith(writeModuleData({ ...HERO, variant: 'left-aligned' }));
  });
});

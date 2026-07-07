// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HotsiteAdminContentResponse } from '@ikaro/types';
import { renderWithIntl } from '@/test-utils';
import { HotsiteEditor } from './HotsiteEditor';

const INITIAL: HotsiteAdminContentResponse = {
  branding: {
    primaryColor: '#2563eb',
    secondaryColor: '#eff6ff',
    backgroundColor: '#ffffff',
    textColor: '#111827',
    headingFontFamily: 'Inter',
    bodyFontFamily: 'Inter',
    logoUrl: '',
    borderRadius: 'rounded',
    buttonStyle: 'filled',
    spacing: 'comfortable',
    shadowStyle: 'subtle',
  },
  layout: [],
  seo: { title: null, description: null },
  isPublished: true,
  updatedAt: '2026-07-01T00:00:00.000Z',
};

describe('HotsiteEditor', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('loads with 3 tabs, Branding active by default', () => {
    renderWithIntl(<HotsiteEditor initial={INITIAL} />);

    expect(screen.getByTestId('hotsite-tab-branding')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('hotsite-tab-layout')).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByTestId('hotsite-tab-seo')).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByTestId('hotsite-primary-color')).toBeInTheDocument();
  });

  it('switches tabs without triggering a network request', async () => {
    const user = userEvent.setup();
    renderWithIntl(<HotsiteEditor initial={INITIAL} />);

    await user.click(screen.getByTestId('hotsite-tab-layout'));

    expect(screen.getByTestId('hotsite-tab-layout')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('hotsite-tab-layout-placeholder')).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('renders Publicar alterações, Preview, and the unpublish action as disabled', () => {
    renderWithIntl(<HotsiteEditor initial={INITIAL} />);

    expect(screen.getByTestId('hotsite-publish-desktop')).toBeDisabled();
    expect(screen.getByTestId('hotsite-publish-mobile')).toBeDisabled();
    expect(screen.getByTestId('hotsite-preview-desktop')).toBeDisabled();
    expect(screen.getByTestId('hotsite-preview-mobile')).toBeDisabled();
    expect(screen.getByTestId('hotsite-unpublish-button')).toBeDisabled();
  });
});

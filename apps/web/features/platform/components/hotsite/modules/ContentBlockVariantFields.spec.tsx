// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ContentBlockModuleData } from '@ikaro/types';
import { renderWithIntl } from '@/test-utils';
import { ContentBlockVariantFields } from './ContentBlockVariantFields';

vi.mock('@/features/platform/api/tenant-settings', () => ({
  generateHotsiteImageSignedUrl: vi.fn(),
  generateHotsiteImageReadSignedUrl: vi.fn(),
  deleteHotsiteImage: vi.fn(),
}));

function renderFor(data: ContentBlockModuleData) {
  renderWithIntl(<ContentBlockVariantFields data={data} onChange={vi.fn()} />);
}

describe('ContentBlockVariantFields', () => {
  it.each([
    [
      { variant: 'trust-grid', title: 'T', items: [{ label: 'a' }, { label: 'b' }] },
      'content-block-appearance',
    ],
    [
      {
        variant: 'process-steps',
        title: 'T',
        items: [
          { title: 'a', body: 'b' },
          { title: 'c', body: 'd' },
        ],
      },
      'content-block-appearance',
    ],
    [
      { variant: 'collage-callout', title: 'T', images: [{ url: 'x' }, { url: 'y' }] },
      'content-block-items',
    ],
    [{ variant: 'technical-callout', title: 'T' }, 'content-block-facts-placement'],
  ] as const)('shows the %s fields only', (data, testId) => {
    renderFor(data as unknown as ContentBlockModuleData);

    expect(screen.getAllByTestId(testId).length).toBeGreaterThan(0);
    expect(screen.queryByTestId('content-block-statement-hint')).not.toBeInTheDocument();
  });

  // Negative guarantee: the statements have no fields of their own — only a pointer to the
  // section background, where their image comes from.
  it.each(['image-statement', 'immersive-statement'] as const)(
    '%s shows only the hint about the section background',
    (variant) => {
      renderFor({ variant, title: 'T' });

      expect(screen.getByTestId('content-block-statement-hint')).toBeInTheDocument();
      expect(screen.queryByTestId('content-block-items')).not.toBeInTheDocument();
      expect(screen.queryByTestId('content-block-appearance')).not.toBeInTheDocument();
    },
  );
});

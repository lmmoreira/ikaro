// @vitest-environment jsdom
import { renderWithIntl } from '@/test-utils';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { axe } from '@/axe-helper';
import { LeadFormSkeleton } from './LeadFormSkeleton';

describe('LeadFormSkeleton', () => {
  it('renders a busy, labeled loading placeholder with the page title for screen readers', () => {
    renderWithIntl(<LeadFormSkeleton title="Quer um orçamento?" />);

    const el = screen.getByTestId('lead-form-loading');
    expect(el).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByText('Quer um orçamento?')).toBeInTheDocument();
  });

  it('has no accessibility violations', async () => {
    const { container } = renderWithIntl(<LeadFormSkeleton title="Quer um orçamento?" />);
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('LeadFormSkeleton readable colours (TD51-S05)', () => {
  it('draws its blocks from the shared skeleton style, with no text colour', () => {
    const { container } = renderWithIntl(<LeadFormSkeleton title="Quer um orçamento?" />);

    const blocks = container.querySelectorAll<HTMLElement>('.animate-pulse');
    expect(blocks.length).toBeGreaterThan(0);
    for (const block of blocks) {
      expect(block.style.backgroundColor).toBe('var(--ba-secondary)');
      expect(block.style.color).toBe('');
    }
  });
});

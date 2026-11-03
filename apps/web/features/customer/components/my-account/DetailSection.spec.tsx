// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DetailSection } from './DetailSection';

describe('DetailSection', () => {
  it('keeps the heading inside the card, so nothing sits above the first box', () => {
    render(
      <DetailSection title="Data e horário" testId="section">
        <p>conteúdo</p>
      </DetailSection>,
    );

    const card = screen.getByTestId('section');
    expect(within(card).getByRole('heading', { level: 2, name: 'Data e horário' })).toBeVisible();
    expect(within(card).getByText('conteúdo')).toBeVisible();
    expect(card.previousElementSibling).toBeNull();
    expect(card.firstElementChild?.tagName).toBe('H2');
  });
});

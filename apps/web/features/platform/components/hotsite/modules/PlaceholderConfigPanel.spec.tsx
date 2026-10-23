// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import { PlaceholderConfigPanel } from './PlaceholderConfigPanel';

describe('PlaceholderConfigPanel', () => {
  it('explains that the module is edited through the Manifesto tab for now', () => {
    renderWithIntl(<PlaceholderConfigPanel data={{}} onChange={vi.fn()} />);

    expect(screen.getByTestId('placeholder-config-panel')).toHaveTextContent(/Manifesto/);
  });

  it('never changes the module data', () => {
    const onChange = vi.fn();

    renderWithIntl(<PlaceholderConfigPanel data={{ items: [] }} onChange={onChange} />);

    expect(onChange).not.toHaveBeenCalled();
  });
});

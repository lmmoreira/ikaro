// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BookingOutcomeActionRail } from './BookingOutcomeActionRail';

describe('BookingOutcomeActionRail', () => {
  it('renders the desktop top content above the shared action content', () => {
    render(
      <BookingOutcomeActionRail desktopTop={<div>Desktop top</div>}>
        <div>Shared action</div>
      </BookingOutcomeActionRail>,
    );

    expect(screen.getAllByText('Desktop top')).toHaveLength(1);
    expect(screen.getAllByText('Shared action')).toHaveLength(2);
  });
});

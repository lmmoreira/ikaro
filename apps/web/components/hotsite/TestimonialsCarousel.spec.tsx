// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { TestimonialsCarousel } from './TestimonialsCarousel';

function items(count: number) {
  return Array.from({ length: count }, (_, i) => <div key={i} data-testid={`item-${i}`} />);
}

describe('TestimonialsCarousel', () => {
  it('renders only the active child', () => {
    render(<TestimonialsCarousel>{items(3)}</TestimonialsCarousel>);

    expect(screen.getByTestId('item-0')).toBeInTheDocument();
    expect(screen.queryByTestId('item-1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('item-2')).not.toBeInTheDocument();
    expect(screen.getByText('1 / 3')).toBeInTheDocument();
  });

  it('does not render navigation when there is only one child', () => {
    render(<TestimonialsCarousel>{items(1)}</TestimonialsCarousel>);

    expect(screen.queryByLabelText('Depoimento anterior')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Próximo depoimento')).not.toBeInTheDocument();
  });

  it('advances activeIndex when "Próximo depoimento" is clicked', async () => {
    const user = userEvent.setup();
    render(<TestimonialsCarousel>{items(3)}</TestimonialsCarousel>);

    await user.click(screen.getByLabelText('Próximo depoimento'));

    expect(screen.getByTestId('item-1')).toBeInTheDocument();
    expect(screen.queryByTestId('item-0')).not.toBeInTheDocument();
    expect(screen.getByText('2 / 3')).toBeInTheDocument();
  });

  it('wraps to the first child after the last when advancing', async () => {
    const user = userEvent.setup();
    render(<TestimonialsCarousel>{items(2)}</TestimonialsCarousel>);

    await user.click(screen.getByLabelText('Próximo depoimento'));
    await user.click(screen.getByLabelText('Próximo depoimento'));

    expect(screen.getByTestId('item-0')).toBeInTheDocument();
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
  });

  it('moves to the previous child when "Depoimento anterior" is clicked, wrapping to the last', async () => {
    const user = userEvent.setup();
    render(<TestimonialsCarousel>{items(3)}</TestimonialsCarousel>);

    await user.click(screen.getByLabelText('Depoimento anterior'));

    expect(screen.getByTestId('item-2')).toBeInTheDocument();
    expect(screen.getByText('3 / 3')).toBeInTheDocument();
  });
});

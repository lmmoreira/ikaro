// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Testimonial } from '@ikaro/types';
import { renderWithIntl } from '@/test-utils';
import { TestimonialCard } from './TestimonialCard';

function makeTestimonial(overrides?: Partial<Testimonial>): Testimonial {
  return {
    authorName: 'Maria Silva',
    text: 'Atendimento excelente, recomendo muito!',
    ...overrides,
  };
}

describe('TestimonialCard', () => {
  it('renders the author name and text', () => {
    renderWithIntl(<TestimonialCard testimonial={makeTestimonial()} />);

    expect(screen.getByText('Maria Silva')).toBeInTheDocument();
    expect(screen.getByText('“Atendimento excelente, recomendo muito!”')).toBeInTheDocument();
  });

  it('renders the translated star-rating aria-label on an accessible img role', () => {
    renderWithIntl(<TestimonialCard testimonial={makeTestimonial({ rating: 4 })} />);

    expect(screen.getByRole('img', { name: '4 de 5 estrelas' })).toBeInTheDocument();
    expect(screen.getAllByTestId('star-filled')).toHaveLength(4);
    expect(screen.getAllByTestId('star-empty')).toHaveLength(1);
  });

  it('renders no star rating when the testimonial has none', () => {
    renderWithIntl(<TestimonialCard testimonial={makeTestimonial()} />);

    expect(screen.queryByTestId('star-filled')).not.toBeInTheDocument();
    expect(screen.queryByTestId('star-empty')).not.toBeInTheDocument();
  });

  it('renders the avatar image when avatarUrl is set', () => {
    renderWithIntl(
      <TestimonialCard
        testimonial={makeTestimonial({ avatarUrl: 'tenants/tenant-1/testimonials/avatar.webp' })}
      />,
    );

    expect(screen.getByAltText('Maria Silva')).toBeInTheDocument();
  });

  it('renders no avatar image when avatarUrl is not set', () => {
    renderWithIntl(<TestimonialCard testimonial={makeTestimonial()} />);

    expect(screen.queryByAltText('Maria Silva')).not.toBeInTheDocument();
  });
});

describe('TestimonialCard readable colours (TD51-S05)', () => {
  it('defaults to the secondary surface with the derived secondary text', () => {
    const { container } = renderWithIntl(<TestimonialCard testimonial={makeTestimonial()} />);

    const card = container.firstElementChild as HTMLElement;
    expect(card.style.backgroundColor).toBe('var(--ba-secondary)');
    expect(card.style.color).toBe('var(--ba-secondary-text)');
  });

  it('uses the colour the section computed for its own card background', () => {
    const { container } = renderWithIntl(
      <TestimonialCard
        testimonial={makeTestimonial()}
        cardBg="var(--ba-section-card-bg, var(--ba-secondary))"
        cardText="var(--ba-section-text, var(--ba-secondary-text))"
      />,
    );

    const card = container.firstElementChild as HTMLElement;
    expect(card.style.backgroundColor).toBe('var(--ba-section-card-bg, var(--ba-secondary))');
    expect(card.style.color).toBe('var(--ba-section-text, var(--ba-secondary-text))');
  });

  it('never paints --ba-text or --ba-primary as the author or quote colour', () => {
    const { container } = renderWithIntl(<TestimonialCard testimonial={makeTestimonial()} />);

    expect(container.innerHTML).not.toMatch(/color: var\(--ba-(text|primary)\)/);
  });
});

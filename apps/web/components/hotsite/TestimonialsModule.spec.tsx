// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { axe } from 'jest-axe';
import { describe, expect, it } from 'vitest';
import type { Testimonial, TestimonialsModuleData } from '@ikaro/types';
import { renderWithIntl } from '@/test-utils';
import { TestimonialsModule } from './TestimonialsModule';

function makeTestimonial(overrides?: Partial<Testimonial>): Testimonial {
  return {
    authorName: 'Maria Silva',
    text: 'Atendimento excelente, recomendo muito!',
    ...overrides,
  };
}

function makeData(overrides?: Partial<TestimonialsModuleData>): TestimonialsModuleData {
  return {
    items: [makeTestimonial()],
    layout: 'grid',
    ...overrides,
  };
}

describe('TestimonialsModule', () => {
  it('renders the default title when none is provided', () => {
    renderWithIntl(<TestimonialsModule data={makeData()} slug="tenant" />);

    expect(
      screen.getByRole('heading', { name: 'O que nossos clientes dizem' }),
    ).toBeInTheDocument();
  });

  it('renders a custom title when provided', () => {
    renderWithIntl(<TestimonialsModule data={makeData({ title: 'Avaliações' })} slug="tenant" />);

    expect(screen.getByRole('heading', { name: 'Avaliações' })).toBeInTheDocument();
  });

  it('renders nothing when items is empty', () => {
    const { container } = renderWithIntl(
      <TestimonialsModule data={makeData({ items: [] })} slug="tenant" />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('renders items with author name and text', () => {
    const items = [
      makeTestimonial({ authorName: 'Maria Silva', text: 'Serviço impecável.' }),
      makeTestimonial({ authorName: 'João Souza', text: 'Voltarei sempre.' }),
    ];
    renderWithIntl(<TestimonialsModule data={makeData({ items })} slug="tenant" />);

    expect(screen.getByText('Maria Silva')).toBeInTheDocument();
    expect(screen.getByText(/Serviço impecável\./)).toBeInTheDocument();
    expect(screen.getByText('João Souza')).toBeInTheDocument();
    expect(screen.getByText(/Voltarei sempre\./)).toBeInTheDocument();
  });

  it('renders 4 filled stars and 1 empty star when rating is 4', () => {
    renderWithIntl(
      <TestimonialsModule
        data={makeData({ items: [makeTestimonial({ rating: 4 })] })}
        slug="tenant"
      />,
    );

    expect(screen.getAllByTestId('star-filled')).toHaveLength(4);
    expect(screen.getAllByTestId('star-empty')).toHaveLength(1);
  });

  it('renders no star elements when rating is absent', () => {
    renderWithIntl(
      <TestimonialsModule data={makeData({ items: [makeTestimonial()] })} slug="tenant" />,
    );

    expect(screen.queryByTestId('star-filled')).not.toBeInTheDocument();
    expect(screen.queryByTestId('star-empty')).not.toBeInTheDocument();
  });

  it('renders items as a list when layout is grid', () => {
    const items = [makeTestimonial(), makeTestimonial({ authorName: 'João Souza' })];
    renderWithIntl(<TestimonialsModule data={makeData({ items, layout: 'grid' })} slug="tenant" />);

    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.queryByLabelText('Próximo depoimento')).not.toBeInTheDocument();
  });

  it('renders the carousel structure when layout is carousel', () => {
    const items = [makeTestimonial(), makeTestimonial({ authorName: 'João Souza' })];
    renderWithIntl(
      <TestimonialsModule data={makeData({ items, layout: 'carousel' })} slug="tenant" />,
    );

    expect(screen.getByLabelText('Depoimento anterior')).toBeInTheDocument();
    expect(screen.getByLabelText('Próximo depoimento')).toBeInTheDocument();
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
  });

  describe('eyebrow', () => {
    it('renders eyebrow when provided', () => {
      renderWithIntl(
        <TestimonialsModule data={makeData({ eyebrow: 'Quem já conhece' })} slug="tenant" />,
      );

      expect(screen.getByTestId('section-eyebrow')).toHaveTextContent('Quem já conhece');
    });

    it('does not render eyebrow when absent', () => {
      const { container } = renderWithIntl(<TestimonialsModule data={makeData()} slug="tenant" />);

      expect(container.querySelector('[data-testid="section-eyebrow"]')).not.toBeInTheDocument();
    });
  });

  it('has no axe violations', async () => {
    const { container } = renderWithIntl(<TestimonialsModule data={makeData()} slug="tenant" />);

    expect(await axe(container)).toHaveNoViolations();
  });
});

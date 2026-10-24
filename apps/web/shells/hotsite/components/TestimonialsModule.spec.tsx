// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { axe } from '@/axe-helper';
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
  it('hides the heading for an explicitly empty title', () => {
    renderWithIntl(<TestimonialsModule data={makeData({ title: '' })} slug="tenant" />);
    expect(screen.queryByRole('heading', { level: 2 })).not.toBeInTheDocument();
    expect(screen.getByText('Maria Silva')).toBeInTheDocument();
  });
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

describe('TestimonialsModule editorial-quote layout and presentation', () => {
  const items = [
    makeTestimonial({ authorName: 'Ana', text: 'Cuidado impecável.' }),
    makeTestimonial({ authorName: 'Bruno', text: 'Voltarei sempre.' }),
  ];

  it('renders each testimonial as a pull-quote with its author as attribution', () => {
    renderWithIntl(
      <TestimonialsModule data={makeData({ layout: 'editorial-quote', items })} slug="tenant" />,
    );

    const quotes = screen.getByTestId('editorial-quotes');
    expect(quotes.querySelectorAll('blockquote')).toHaveLength(2);
    expect(quotes.querySelectorAll('figcaption')[0]).toHaveTextContent('Ana');
    expect(screen.getByText(/Cuidado impecável/)).toBeInTheDocument();
  });

  it('has no accessibility violations', async () => {
    const { container } = renderWithIntl(
      <TestimonialsModule data={makeData({ layout: 'editorial-quote', items })} slug="tenant" />,
    );

    expect(await axe(container)).toHaveNoViolations();
  });

  it('uses the section tokens for its cards when a surface is set', () => {
    const { container } = renderWithIntl(
      <TestimonialsModule
        data={makeData()}
        slug="tenant"
        presentation={{ surface: 'secondary' }}
        sectionTokens={{
          '--ba-section-bg': '#111111',
          '--ba-section-text': '#FFFFFF',
          '--ba-section-card-bg': '#222222',
          '--ba-section-divider': '#333333',
        }}
      />,
    );

    expect((container.querySelector('section') as HTMLElement).style.backgroundColor).toBe(
      'var(--ba-section-bg)',
    );
    expect(container.querySelector('li > div')).toHaveStyle({
      backgroundColor: 'var(--ba-section-card-bg, var(--ba-secondary))',
    });
  });
});

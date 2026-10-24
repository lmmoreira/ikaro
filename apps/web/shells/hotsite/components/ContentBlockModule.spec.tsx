// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ContentBlockModuleData } from '@ikaro/types';
import { axe } from '@/axe-helper';
import { ContentBlockModule } from './ContentBlockModule';

const VARIANTS: readonly ContentBlockModuleData[] = [
  {
    variant: 'trust-grid',
    title: 'Por que nos escolher',
    items: [
      { label: 'Produtos premium', description: 'Linha profissional' },
      { label: 'Equipe treinada' },
    ],
  },
  {
    variant: 'process-steps',
    title: 'Como funciona',
    items: [
      { title: 'Escolha', body: 'Selecione o serviço.' },
      { title: 'Agende', body: 'Escolha o horário.' },
      { title: 'Aproveite', body: 'Cuidamos do resto.' },
    ],
  },
  {
    variant: 'collage-callout',
    title: 'Nosso espaço',
    images: [
      { url: 'https://cdn.example.com/a.png', alt: 'Recepção' },
      { url: 'https://cdn.example.com/b.png', alt: '' },
    ],
  },
  {
    variant: 'technical-callout',
    title: 'Em números',
    facts: [
      { value: '12', label: 'anos' },
      { value: '4.9', label: 'nota média' },
    ],
  },
  { variant: 'image-statement', title: 'Cuidado em cada detalhe' },
  { variant: 'immersive-statement', title: 'Uma experiência completa' },
];

function renderBlock(
  data: ContentBlockModuleData,
  props: Partial<React.ComponentProps<typeof ContentBlockModule>> = {},
): HTMLElement {
  const { container } = render(<ContentBlockModule data={data} slug="tenant" {...props} />);
  return container.querySelector('section') as HTMLElement;
}

describe('ContentBlockModule', () => {
  it('renders numbered, tinted trust tiles alongside the copy', () => {
    renderBlock(
      {
        ...VARIANTS[0],
        variant: 'trust-grid',
        appearance: 'tiles',
        items: [{ label: 'Primeiro' }, { label: 'Segundo' }],
      },
      {
        tints: [
          { background: '#FCE4D3', text: '#3C2A24' },
          { background: '#DCEFDC', text: '#3C2A24' },
          { background: '#ECDFFD', text: '#3C2A24' },
        ],
      },
    );
    const tiles = screen.getByTestId('trust-grid-tiles');
    expect(within(tiles).getAllByRole('listitem')).toHaveLength(2);
    expect(within(tiles).getByText('01')).toBeInTheDocument();
    expect(within(tiles).getByText('02')).toBeInTheDocument();
    expect(within(tiles).getByText('Primeiro').closest('li')).toHaveStyle({
      backgroundColor: '#FCE4D3',
    });
  });

  it('shows ruled process labels and a technical kicker', () => {
    renderBlock({
      variant: 'process-steps',
      title: 'Etapas',
      appearance: 'ruled',
      items: [
        { title: 'Primeiro', body: 'A', label: 'Escuta' },
        { title: 'Segundo', body: 'B' },
      ],
    });
    expect(screen.getByText(/Escuta/)).toBeInTheDocument();
    expect(screen.getByTestId('steps')).toHaveClass('border-y');
    renderBlock({
      variant: 'technical-callout',
      title: 'Detalhe',
      factsPlacement: 'kicker',
      facts: [{ value: '01', label: 'Proteção' }],
    });
    expect(screen.getByText('Proteção')).toBeInTheDocument();
  });
  it.each(VARIANTS)(
    'renders the $variant variant with its title as the section heading',
    (data) => {
      const section = renderBlock(data);

      expect(section).toHaveAttribute('data-variant', data.variant);
      expect(section).toHaveAttribute('id', 'content-block');
      expect(
        within(section).getByRole('heading', { level: 2, name: data.title }),
      ).toBeInTheDocument();
    },
  );

  it.each(VARIANTS)('has no accessibility violations for $variant', async (data) => {
    const { container } = render(<ContentBlockModule data={data} slug="tenant" />);

    expect(await axe(container)).toHaveNoViolations();
  });

  describe('trust-grid', () => {
    it('lists every item with its optional description', () => {
      renderBlock(VARIANTS[0]);

      const items = within(screen.getByTestId('trust-grid-items')).getAllByRole('listitem');
      expect(items).toHaveLength(2);
      expect(screen.getByText('Linha profissional')).toBeInTheDocument();
    });
  });

  describe('process-steps', () => {
    it('is an ordered list and numbers the steps in the renderer', () => {
      renderBlock(VARIANTS[1]);

      const steps = screen.getByTestId('steps');
      expect(steps.tagName).toBe('OL');
      expect(within(steps).getAllByRole('listitem')).toHaveLength(3);
      expect(within(steps).getByText('01')).toHaveAttribute('aria-hidden', 'true');
      expect(within(steps).getByText('03')).toBeInTheDocument();
    });
  });

  describe('collage-callout', () => {
    it('renders every image, with an empty alt marking an image decorative', () => {
      renderBlock(VARIANTS[2]);

      const images = screen.getByTestId('collage-images').querySelectorAll('img');
      expect(images).toHaveLength(2);
      expect(screen.getByAltText('Recepção')).toBeInTheDocument();
      expect(images[1]).toHaveAttribute('alt', '');
    });
  });

  describe('technical-callout', () => {
    it('renders each fact as a term/description pair', () => {
      renderBlock(VARIANTS[3]);

      const facts = screen.getByTestId('technical-facts');
      expect(within(facts).getByText('12')).toBeInTheDocument();
      expect(within(facts).getByText('anos')).toBeInTheDocument();
    });

    it('renders without facts', () => {
      renderBlock({ variant: 'technical-callout', title: 'Só texto' });

      expect(screen.queryByTestId('technical-facts')).not.toBeInTheDocument();
    });
  });

  describe('image-statement and immersive-statement', () => {
    it('take their imagery from presentation.background and keep readable text over it', () => {
      const section = renderBlock(VARIANTS[4], {
        presentation: { background: { imageUrl: 'https://cdn.example.com/bg.png' } },
      });

      expect(section.querySelector('img')).toHaveAttribute(
        'src',
        expect.stringContaining('bg.png'),
      );
      expect(screen.getByTestId('section-overlay')).toBeInTheDocument();
    });

    it('immersive-statement is a tall, centred section by default', () => {
      const section = renderBlock(VARIANTS[5]);

      expect(section).toHaveClass('min-h-[70vh]', 'justify-center');
    });
  });

  describe('shared copy', () => {
    it('renders the eyebrow, the restricted Markdown body and a CTA to a section anchor', () => {
      renderBlock({
        variant: 'image-statement',
        title: 'Título',
        eyebrow: 'Atelier',
        body: 'Texto com **destaque** e [link](https://example.com).',
        cta: { label: 'Ver serviços', target: 'service-list' },
      });

      expect(screen.getByTestId('section-eyebrow')).toHaveTextContent('Atelier');
      expect(screen.getByText('destaque').tagName).toBe('STRONG');
      expect(screen.getByRole('link', { name: 'Ver serviços' })).toHaveAttribute(
        'href',
        '#service-list',
      );
    });

    it('does not render an image written in the body', () => {
      const section = renderBlock({
        variant: 'image-statement',
        title: 'T',
        body: '![x](https://example.com/x.png)',
      });

      expect(section.querySelector('img')).toBeNull();
    });

    it.each([
      ['left', 'text-left'],
      ['center', 'text-center'],
      ['right', 'text-right'],
    ] as const)('aligns the copy %s', (align, expected) => {
      renderBlock({ variant: 'image-statement', title: 'Título', align });

      expect(screen.getByRole('heading', { name: 'Título' }).parentElement).toHaveClass(expected);
    });

    it('defaults a statement to centred copy', () => {
      renderBlock(VARIANTS[4]);

      expect(screen.getByRole('heading', { name: VARIANTS[4].title }).parentElement).toHaveClass(
        'text-center',
      );
    });
  });

  it('adopts the section shell: a surface swaps the tokens and the standard width bounds it', () => {
    const section = renderBlock(VARIANTS[4], {
      presentation: { surface: 'primary' },
      sectionTokens: {
        '--ba-section-bg': '#111111',
        '--ba-section-text': '#FFFFFF',
        '--ba-section-card-bg': '#222222',
        '--ba-section-divider': '#333333',
      },
    });

    expect(section.style.backgroundColor).toBe('var(--ba-section-bg)');
    expect(section.firstElementChild).toHaveClass('max-w-7xl');
  });
});

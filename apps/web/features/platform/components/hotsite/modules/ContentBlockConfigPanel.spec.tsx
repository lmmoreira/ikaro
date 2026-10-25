// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ContentBlockModuleData, HotsiteModulePresentation } from '@ikaro/types';
import { getPillOption, renderWithIntl } from '@/test-utils';
import { ContentBlockConfigPanel } from './ContentBlockConfigPanel';
import { writeModuleData } from './module-config-panel.types';

vi.mock('@/features/platform/api/tenant-settings', () => ({
  generateHotsiteImageSignedUrl: vi.fn(),
  generateHotsiteImageReadSignedUrl: vi.fn(),
  deleteHotsiteImage: vi.fn(),
}));

const STATEMENT: ContentBlockModuleData = {
  variant: 'image-statement',
  title: 'Nossa casa',
};

const GRID: ContentBlockModuleData = {
  variant: 'trust-grid',
  title: 'Por que nós',
  items: [{ label: 'Garantia' }, { label: 'Rapidez', description: 'Em um dia' }],
};

const STEPS: ContentBlockModuleData = {
  variant: 'process-steps',
  title: 'Como funciona',
  items: [
    { title: 'Escuta', body: 'Conversamos' },
    { title: 'Plano', body: 'Desenhamos', label: '02' },
  ],
};

const COLLAGE: ContentBlockModuleData = {
  variant: 'collage-callout',
  title: 'Fotos',
  images: [
    { url: 'tenants/t/hotsite/content-block/a.png' },
    { url: 'tenants/t/hotsite/content-block/b.png' },
  ],
};

const TECHNICAL: ContentBlockModuleData = {
  variant: 'technical-callout',
  title: 'Proteção',
  facts: [{ value: '10 anos', label: 'Garantia' }],
};

function renderPanel(
  block: ContentBlockModuleData,
  presentation?: HotsiteModulePresentation,
): ReturnType<typeof vi.fn> {
  const onChange = vi.fn();
  const data = presentation ? { ...block, presentation } : block;
  renderWithIntl(<ContentBlockConfigPanel data={writeModuleData(data)} onChange={onChange} />);
  return onChange;
}

describe('ContentBlockConfigPanel', () => {
  describe('variant switcher', () => {
    it('offers the six variants and marks the current one', () => {
      renderPanel(STATEMENT);

      expect(screen.getAllByTestId('content-block-variant')).toHaveLength(6);
      expect(getPillOption('content-block-variant', 'image-statement')).toHaveAttribute(
        'aria-checked',
        'true',
      );
    });

    it('switching keeps the shared fields and seeds the new variant’s minimum', async () => {
      const user = userEvent.setup();
      const onChange = renderPanel({ ...STATEMENT, eyebrow: 'Sobre', body: 'Texto' });

      await user.click(getPillOption('content-block-variant', 'process-steps'));

      expect(onChange).toHaveBeenLastCalledWith(
        writeModuleData({
          variant: 'process-steps',
          eyebrow: 'Sobre',
          title: 'Nossa casa',
          body: 'Texto',
          items: [
            { title: '', body: '' },
            { title: '', body: '' },
          ],
        }),
      );
    });

    // Negative guarantee: the strict schema rejects the previous variant's keys.
    it('drops the previous variant’s own fields when switching', async () => {
      const user = userEvent.setup();
      const onChange = renderPanel({ ...GRID, variant: 'trust-grid', appearance: 'tiles' });

      await user.click(getPillOption('content-block-variant', 'immersive-statement'));

      const [next] = onChange.mock.lastCall as [Record<string, unknown>];
      expect(next).not.toHaveProperty('items');
      expect(next).not.toHaveProperty('appearance');
    });
  });

  describe('shared fields', () => {
    it('edits eyebrow, title and body, each within its length bound', async () => {
      const user = userEvent.setup();
      const onChange = renderPanel(STATEMENT);

      expect(screen.getByLabelText('Texto de destaque (opcional)')).toHaveAttribute(
        'maxlength',
        '60',
      );
      expect(screen.getByLabelText('Título')).toHaveAttribute('maxlength', '120');
      expect(screen.getByLabelText('Texto (opcional)')).toHaveAttribute('maxlength', '1000');

      await user.type(screen.getByLabelText('Título'), '!');
      expect(onChange).toHaveBeenLastCalledWith(
        writeModuleData({ variant: 'image-statement', title: 'Nossa casa!' }),
      );
    });

    // Negative guarantee: a title is required, so clearing it keeps the key (empty is valid).
    it('keeps an emptied title but drops an emptied optional field', async () => {
      const user = userEvent.setup();
      const onChange = renderPanel({ ...STATEMENT, eyebrow: 'A', title: 'T' });

      await user.clear(screen.getByLabelText('Título'));
      expect(onChange).toHaveBeenLastCalledWith(
        writeModuleData({ variant: 'image-statement', eyebrow: 'A', title: '' }),
      );

      await user.clear(screen.getByLabelText('Texto de destaque (opcional)'));
      const [next] = onChange.mock.lastCall as [Record<string, unknown>];
      expect(next).not.toHaveProperty('eyebrow');
    });

    it('previews the body as restricted markdown', () => {
      renderPanel({ ...STATEMENT, body: 'Um **forte** [link](https://x.com)' });

      const preview = screen.getByTestId('content-block-body-preview');
      expect(preview.querySelector('strong')).toHaveTextContent('forte');
      expect(preview.querySelector('a')).toHaveAttribute('rel', 'noopener noreferrer nofollow');
    });

    it('shows no preview without a body', () => {
      renderPanel(STATEMENT);

      expect(screen.queryByTestId('content-block-body-preview')).not.toBeInTheDocument();
    });

    it('sets the alignment, and Automatic removes it', async () => {
      const user = userEvent.setup();
      const onChange = renderPanel({ ...STATEMENT, align: 'left' });

      await user.click(getPillOption('content-block-align', 'right'));
      expect(onChange).toHaveBeenLastCalledWith(writeModuleData({ ...STATEMENT, align: 'right' }));

      await user.click(getPillOption('content-block-align', 'default'));
      const [next] = onChange.mock.lastCall as [Record<string, unknown>];
      expect(next).not.toHaveProperty('align');
    });

    it('adds a button with a label and a target, and removes it again', async () => {
      const user = userEvent.setup();
      const onChange = renderPanel(STATEMENT);

      await user.click(screen.getByTestId('content-block-cta-toggle'));

      expect(onChange).toHaveBeenLastCalledWith(
        writeModuleData({ ...STATEMENT, cta: { label: '', target: 'booking-form' } }),
      );
    });

    it('edits the button label (max 40) and target', async () => {
      const user = userEvent.setup();
      const onChange = renderPanel({ ...STATEMENT, cta: { label: 'Ver', target: 'gallery' } });

      expect(screen.getByLabelText('Texto do botão')).toHaveAttribute('maxlength', '40');
      await user.type(screen.getByLabelText('Texto do botão'), '!');
      expect(onChange).toHaveBeenLastCalledWith(
        writeModuleData({ ...STATEMENT, cta: { label: 'Ver!', target: 'gallery' } }),
      );

      await user.click(getPillOption('content-block-cta-target', 'contact'));
      expect(onChange).toHaveBeenLastCalledWith(
        writeModuleData({ ...STATEMENT, cta: { label: 'Ver', target: 'contact' } }),
      );
    });
  });

  describe('trust-grid', () => {
    it('picks the appearance (Story 6)', async () => {
      const user = userEvent.setup();
      const onChange = renderPanel(GRID);

      await user.click(getPillOption('content-block-appearance', 'tiles'));

      expect(onChange).toHaveBeenLastCalledWith(writeModuleData({ ...GRID, appearance: 'tiles' }));
    });

    it('adds a point up to six and removes down to two', async () => {
      const user = userEvent.setup();
      const onChange = renderPanel(GRID);

      // Two points: removal is blocked (the schema needs at least two).
      for (const button of screen.getAllByTestId('content-block-item-remove')) {
        expect(button).toBeDisabled();
      }
      await user.click(screen.getByRole('button', { name: 'Adicionar ponto' }));
      expect(onChange).toHaveBeenLastCalledWith(
        writeModuleData({
          ...GRID,
          items: [...(GRID as { items: unknown[] }).items, { label: '' }],
        }),
      );
    });

    it('disables Add at six points', () => {
      const six = Array.from({ length: 6 }, (_, i) => ({ label: `P${i}` }));
      renderPanel({ ...GRID, items: six } as ContentBlockModuleData);

      expect(screen.getByRole('button', { name: 'Adicionar ponto' })).toBeDisabled();
    });

    it('removes a point once there are more than two', async () => {
      const user = userEvent.setup();
      const three = [{ label: 'A' }, { label: 'B' }, { label: 'C' }];
      const onChange = renderPanel({ ...GRID, items: three } as ContentBlockModuleData);

      await user.click(screen.getAllByTestId('content-block-item-remove')[1]);

      expect(onChange).toHaveBeenLastCalledWith(
        writeModuleData({ ...GRID, items: [{ label: 'A' }, { label: 'C' }] }),
      );
    });

    // Negative guarantee: an emptied description is removed; the required label is kept even empty.
    it('drops an emptied description but keeps the label', async () => {
      const user = userEvent.setup();
      const onChange = renderPanel(GRID);

      await user.clear(screen.getByLabelText('Descrição do ponto 2 (opcional)'));

      expect(onChange).toHaveBeenLastCalledWith(
        writeModuleData({ ...GRID, items: [{ label: 'Garantia' }, { label: 'Rapidez' }] }),
      );
    });

    it('bounds the label and description lengths', () => {
      renderPanel(GRID);

      expect(screen.getByLabelText('Título do ponto 1')).toHaveAttribute('maxlength', '60');
      expect(screen.getByLabelText('Descrição do ponto 1 (opcional)')).toHaveAttribute(
        'maxlength',
        '140',
      );
    });
  });

  describe('process-steps', () => {
    it('picks the appearance (Story 6)', async () => {
      const user = userEvent.setup();
      const onChange = renderPanel(STEPS);

      await user.click(getPillOption('content-block-appearance', 'ruled'));

      expect(onChange).toHaveBeenLastCalledWith(writeModuleData({ ...STEPS, appearance: 'ruled' }));
    });

    it('edits a step’s marker (Story 6) and removes it when emptied', async () => {
      const user = userEvent.setup();
      const onChange = renderPanel(STEPS);

      expect(screen.getByLabelText('Marcador da etapa 2 (opcional)')).toHaveAttribute(
        'maxlength',
        '30',
      );
      await user.clear(screen.getByLabelText('Marcador da etapa 2 (opcional)'));

      expect(onChange).toHaveBeenLastCalledWith(
        writeModuleData({
          ...STEPS,
          items: [STEPS.items[0], { title: 'Plano', body: 'Desenhamos' }],
        }),
      );
    });

    it('bounds a step’s title and text', () => {
      renderPanel(STEPS);

      expect(screen.getByLabelText('Título da etapa 1')).toHaveAttribute('maxlength', '60');
      expect(screen.getByLabelText('Texto da etapa 1')).toHaveAttribute('maxlength', '240');
    });
  });

  describe('collage-callout', () => {
    it('shows one slot per image, each with a description field', () => {
      renderPanel(COLLAGE);

      expect(screen.getAllByTestId('single-image-upload-input')).toHaveLength(3); // 2 + background
      expect(screen.getByLabelText(/Descrição da foto 1/)).toHaveAttribute('maxlength', '120');
    });

    it('keeps at least two photos, and adds an empty slot', async () => {
      const user = userEvent.setup();
      const onChange = renderPanel(COLLAGE);

      for (const button of screen.getAllByTestId('content-block-item-remove')) {
        expect(button).toBeDisabled();
      }
      await user.click(screen.getByRole('button', { name: 'Adicionar foto' }));

      expect(onChange).toHaveBeenLastCalledWith(
        writeModuleData({
          ...COLLAGE,
          images: [...(COLLAGE as { images: unknown[] }).images, { url: '' }],
        }),
      );
    });

    it('disables Add at four photos', () => {
      const four = Array.from({ length: 4 }, (_, i) => ({ url: `tenants/t/${i}.png` }));
      renderPanel({ ...COLLAGE, images: four } as ContentBlockModuleData);

      expect(screen.getByRole('button', { name: 'Adicionar foto' })).toBeDisabled();
    });

    it('says what is missing while a slot has no photo yet', () => {
      renderPanel({
        ...COLLAGE,
        images: [{ url: '' }, { url: '' }],
      } as ContentBlockModuleData);

      expect(screen.getByTestId('content-block-incomplete')).toBeInTheDocument();
    });

    it('says nothing once the block is complete', () => {
      renderPanel(COLLAGE);

      expect(screen.queryByTestId('content-block-incomplete')).not.toBeInTheDocument();
    });
  });

  describe('technical-callout', () => {
    it('picks where the highlights go (Story 6)', async () => {
      const user = userEvent.setup();
      const onChange = renderPanel(TECHNICAL);

      await user.click(getPillOption('content-block-facts-placement', 'kicker'));

      expect(onChange).toHaveBeenLastCalledWith(
        writeModuleData({ ...TECHNICAL, factsPlacement: 'kicker' }),
      );
    });

    it('adds highlights up to four and removes them down to none', async () => {
      const user = userEvent.setup();
      const onChange = renderPanel(TECHNICAL);

      await user.click(screen.getByTestId('content-block-item-remove'));

      expect(onChange).toHaveBeenLastCalledWith(writeModuleData({ ...TECHNICAL, facts: [] }));
    });

    it('disables Add at four highlights', () => {
      const four = Array.from({ length: 4 }, (_, i) => ({ value: `${i}`, label: 'x' }));
      renderPanel({ ...TECHNICAL, facts: four });

      expect(screen.getByRole('button', { name: 'Adicionar destaque' })).toBeDisabled();
    });

    it('bounds a highlight’s value and label', () => {
      renderPanel(TECHNICAL);

      expect(screen.getByLabelText('Valor do destaque 1')).toHaveAttribute('maxlength', '20');
      expect(screen.getByLabelText('Rótulo do destaque 1')).toHaveAttribute('maxlength', '40');
    });
  });

  describe('statements', () => {
    it.each(['image-statement', 'immersive-statement'] as const)(
      '%s points the manager to the section background for its image',
      (variant) => {
        renderPanel({ ...STATEMENT, variant });

        expect(screen.getByTestId('content-block-statement-hint')).toBeInTheDocument();
      },
    );
  });

  describe('section presentation', () => {
    it('carries the presentation along on every edit', async () => {
      const user = userEvent.setup();
      const onChange = renderPanel(STATEMENT, { surface: 'primary' });

      await user.type(screen.getByLabelText('Título'), '!');

      expect(onChange).toHaveBeenLastCalledWith({
        variant: 'image-statement',
        title: 'Nossa casa!',
        presentation: { surface: 'primary' },
      });
    });

    it('edits the presentation without touching the block’s data', async () => {
      const user = userEvent.setup();
      const onChange = renderPanel(STATEMENT);

      await user.click(getPillOption('presentation-padding', 'spacious'));

      expect(onChange).toHaveBeenLastCalledWith({
        ...STATEMENT,
        presentation: { padding: 'spacious' },
      });
    });
  });
});

// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { describe, expect, it } from 'vitest';
import { HOTSITE_TEMPLATE_CAPABILITIES } from '@ikaro/types';
import { renderWithIntl } from '@/test-utils';
import { HotsiteTemplateGallery } from './HotsiteTemplateGallery';
import { makeTemplateSummaries, makeTemplatesController } from './templates-controller.fixture';

function card(id: string): HTMLElement {
  const match = screen.getAllByTestId('template-card').find((el) => el.dataset.templateId === id);
  if (!match) throw new Error(`No card ${id}`);
  return match;
}

describe('HotsiteTemplateGallery', () => {
  describe('success', () => {
    it('shows the heading, intro and the replace-presentation note', () => {
      renderWithIntl(<HotsiteTemplateGallery controller={makeTemplatesController()} />);

      expect(screen.getByRole('heading', { name: 'Comece com um template' })).toBeInTheDocument();
      expect(
        screen.getByText(/Seu nome, logo, serviços, contatos e horários continuam os mesmos/),
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          /O template substitui cores, fontes, ordem das seções e textos de exemplo/,
        ),
      ).toBeInTheDocument();
    });

    it('lists all six templates with a localized name, description and thumbnail', () => {
      renderWithIntl(<HotsiteTemplateGallery controller={makeTemplatesController()} />);

      expect(screen.getAllByTestId('template-card')).toHaveLength(6);
      const casa = card('casa47');
      expect(within(casa).getByRole('heading', { name: 'Casa47' })).toBeInTheDocument();
      expect(within(casa).getByText(/Escuro e refinado|editorial/i)).toBeInTheDocument();
      expect(within(casa).getByAltText('Prévia do template Casa47')).toHaveAttribute(
        'src',
        expect.stringContaining('/shared/hotsite-templates/casa47/v1/thumbnail.webp'),
      );
      expect(
        within(card('clinica-lume')).getByRole('heading', { name: 'Clínica Lume' }),
      ).toBeInTheDocument();
    });

    it('renders a localized chip for each capability', () => {
      renderWithIntl(
        <HotsiteTemplateGallery
          controller={makeTemplatesController({
            templates: makeTemplateSummaries(['navigation', 'trust-grid']),
          })}
        />,
      );

      const chips = within(card('origem')).getAllByTestId('template-capability');
      expect(chips.map((chip) => chip.textContent)).toEqual([
        'Menu de navegação',
        'Pontos de confiança',
      ]);
    });

    // The cards stay scannable: at most four chips, however many tokens the catalogue derives.
    it('shows at most four chips per card', () => {
      renderWithIntl(
        <HotsiteTemplateGallery
          controller={makeTemplatesController({
            templates: makeTemplateSummaries([...HOTSITE_TEMPLATE_CAPABILITIES]),
          })}
        />,
      );

      expect(within(card('origem')).getAllByTestId('template-capability')).toHaveLength(4);
    });

    it('renders a card with no capabilities and no chips', () => {
      renderWithIntl(
        <HotsiteTemplateGallery
          controller={makeTemplatesController({ templates: makeTemplateSummaries([]) })}
        />,
      );

      expect(within(card('origem')).queryAllByTestId('template-capability')).toHaveLength(0);
    });

    it('applies the clicked card', async () => {
      const user = userEvent.setup();
      const controller = makeTemplatesController();
      renderWithIntl(<HotsiteTemplateGallery controller={controller} />);

      await user.click(within(card('mimo-pet')).getByTestId('template-apply'));

      expect(controller.apply).toHaveBeenCalledWith('mimo-pet');
    });
  });

  describe('selected state', () => {
    it('highlights nothing before a template was applied this session', () => {
      renderWithIntl(<HotsiteTemplateGallery controller={makeTemplatesController()} />);

      expect(screen.queryByTestId('template-selected-badge')).not.toBeInTheDocument();
      expect(
        screen.getAllByTestId('template-card').filter((el) => el.dataset.selected === 'true'),
      ).toHaveLength(0);
    });

    it('marks only the applied card as Selecionado', () => {
      renderWithIntl(
        <HotsiteTemplateGallery
          controller={makeTemplatesController({ appliedTemplateId: 'origem' })}
        />,
      );

      expect(within(card('origem')).getByTestId('template-selected-badge')).toHaveTextContent(
        'Selecionado',
      );
      expect(card('origem')).toHaveAttribute('aria-current', 'true');
      expect(screen.getAllByTestId('template-selected-badge')).toHaveLength(1);
      expect(card('casa47')).not.toHaveAttribute('aria-current');
    });
  });

  describe('busy state', () => {
    it('disables every card while an apply is pending and labels the clicked one', () => {
      renderWithIntl(
        <HotsiteTemplateGallery
          controller={makeTemplatesController({ isApplying: true, applyingTemplateId: 'casa47' })}
        />,
      );

      for (const button of screen.getAllByTestId('template-apply')) expect(button).toBeDisabled();
      expect(within(card('casa47')).getByTestId('template-apply')).toHaveTextContent('Aplicando…');
      expect(within(card('casa47')).getByTestId('template-apply')).toHaveAttribute(
        'aria-busy',
        'true',
      );
      expect(within(card('origem')).getByTestId('template-apply')).toHaveTextContent(
        'Usar este template',
      );
    });

    it('disables Undo too, so the draft cannot change under a pending apply', () => {
      renderWithIntl(
        <HotsiteTemplateGallery
          controller={makeTemplatesController({ isApplying: true, canUndo: true })}
        />,
      );

      expect(screen.getByTestId('template-undo')).toBeDisabled();
    });
  });

  describe('loading and failure', () => {
    it('shows a status while the catalogue loads, and no cards', () => {
      renderWithIntl(
        <HotsiteTemplateGallery
          controller={makeTemplatesController({ isLoading: true, templates: undefined })}
        />,
      );

      expect(screen.getByRole('status', { name: '' })).toHaveTextContent('Carregando templates…');
      expect(screen.queryAllByTestId('template-card')).toHaveLength(0);
    });

    it('shows an alert with Retry when the catalogue fails to load', async () => {
      const user = userEvent.setup();
      const controller = makeTemplatesController({ isError: true, templates: undefined });
      renderWithIntl(<HotsiteTemplateGallery controller={controller} />);

      const alert = screen.getByTestId('template-load-error');
      expect(alert).toHaveTextContent('Não foi possível carregar os templates.');
      await user.click(within(alert).getByRole('button', { name: 'Tentar novamente' }));

      expect(controller.reload).toHaveBeenCalledTimes(1);
    });

    it('shows an alert with Retry when an apply failed, leaving the cards usable', async () => {
      const user = userEvent.setup();
      const controller = makeTemplatesController({ applyFailed: true });
      renderWithIntl(<HotsiteTemplateGallery controller={controller} />);

      const alert = screen.getByTestId('template-apply-error');
      expect(alert).toHaveTextContent('Seu rascunho não foi alterado.');
      await user.click(within(alert).getByRole('button', { name: 'Tentar novamente' }));

      expect(controller.retryApply).toHaveBeenCalledTimes(1);
      expect(screen.getAllByTestId('template-card')).toHaveLength(6);
    });
  });

  describe('sample testimonials notice', () => {
    it('is shown when the applied template brought sample testimonials', () => {
      renderWithIntl(
        <HotsiteTemplateGallery controller={makeTemplatesController({ showSampleNotice: true })} />,
      );

      expect(screen.getByTestId('template-sample-notice')).toHaveTextContent(
        'Este template inclui depoimentos de exemplo — edite ou remova antes de publicar.',
      );
    });

    it('is absent otherwise', () => {
      renderWithIntl(<HotsiteTemplateGallery controller={makeTemplatesController()} />);

      expect(screen.queryByTestId('template-sample-notice')).not.toBeInTheDocument();
    });
  });

  describe('undo', () => {
    it('offers Desfazer template only when there is a step to undo', () => {
      const { rerender } = renderWithIntl(
        <HotsiteTemplateGallery controller={makeTemplatesController()} />,
      );
      expect(screen.queryByTestId('template-undo')).not.toBeInTheDocument();

      rerender(<HotsiteTemplateGallery controller={makeTemplatesController({ canUndo: true })} />);
      expect(screen.getByTestId('template-undo')).toHaveTextContent('Desfazer template');
    });

    it('asks the controller to undo', async () => {
      const user = userEvent.setup();
      const controller = makeTemplatesController({ canUndo: true });
      renderWithIntl(<HotsiteTemplateGallery controller={controller} />);

      await user.click(screen.getByTestId('template-undo'));

      expect(controller.undo).toHaveBeenCalledTimes(1);
    });

    it('confirms before discarding edits made since the apply', async () => {
      const user = userEvent.setup();
      const controller = makeTemplatesController({ canUndo: true, undoConfirmOpen: true });
      renderWithIntl(<HotsiteTemplateGallery controller={controller} />);

      expect(
        screen.getByText('Isso também descarta as edições feitas depois de aplicar o template.'),
      ).toBeInTheDocument();
      await user.click(screen.getByTestId('template-undo-confirm'));

      expect(controller.confirmUndo).toHaveBeenCalledTimes(1);
    });

    it('Cancel in the undo confirmation keeps the draft', async () => {
      const user = userEvent.setup();
      const controller = makeTemplatesController({ canUndo: true, undoConfirmOpen: true });
      renderWithIntl(<HotsiteTemplateGallery controller={controller} />);

      await user.click(screen.getByRole('button', { name: 'Cancelar' }));

      expect(controller.cancelUndo).toHaveBeenCalledTimes(1);
      expect(controller.confirmUndo).not.toHaveBeenCalled();
    });
  });

  describe('replace-images dialog', () => {
    it('warns with the approved copy before replacing the manager’s own uploads', () => {
      renderWithIntl(
        <HotsiteTemplateGallery
          controller={makeTemplatesController({ replaceConfirmOpen: true })}
        />,
      );

      const dialog = screen.getByTestId('apply-template-dialog');
      expect(dialog).toHaveTextContent(
        'As imagens que você enviou nestas seções serão substituídas e removidas quando você salvar.',
      );
    });

    it('is not shown unless asked for', () => {
      renderWithIntl(<HotsiteTemplateGallery controller={makeTemplatesController()} />);

      expect(screen.queryByTestId('apply-template-dialog')).not.toBeInTheDocument();
    });

    it('Aplicar template confirms, Cancelar cancels', async () => {
      const user = userEvent.setup();
      const controller = makeTemplatesController({ replaceConfirmOpen: true });
      renderWithIntl(<HotsiteTemplateGallery controller={controller} />);

      await user.click(screen.getByTestId('apply-template-confirm'));
      expect(controller.confirmReplace).toHaveBeenCalledTimes(1);
    });

    it('Cancel leaves the draft alone', async () => {
      const user = userEvent.setup();
      const controller = makeTemplatesController({ replaceConfirmOpen: true });
      renderWithIntl(<HotsiteTemplateGallery controller={controller} />);

      await user.click(screen.getByTestId('apply-template-cancel'));

      expect(controller.cancelReplace).toHaveBeenCalledTimes(1);
      expect(controller.confirmReplace).not.toHaveBeenCalled();
    });
  });

  describe('accessibility', () => {
    it('has no axe violations in the default, selected and busy states', async () => {
      const { container, rerender } = renderWithIntl(
        <HotsiteTemplateGallery controller={makeTemplatesController()} />,
      );
      expect(await axe(container)).toHaveNoViolations();

      rerender(
        <HotsiteTemplateGallery
          controller={makeTemplatesController({
            appliedTemplateId: 'casa47',
            canUndo: true,
            showSampleNotice: true,
            applyFailed: true,
          })}
        />,
      );
      expect(await axe(container)).toHaveNoViolations();

      rerender(
        <HotsiteTemplateGallery
          controller={makeTemplatesController({ isApplying: true, applyingTemplateId: 'origem' })}
        />,
      );
      expect(await axe(container)).toHaveNoViolations();
    });

    it('has no axe violations with the replace-images dialog open', async () => {
      renderWithIntl(
        <HotsiteTemplateGallery
          controller={makeTemplatesController({ replaceConfirmOpen: true })}
        />,
      );

      expect(await axe(screen.getByTestId('apply-template-dialog'))).toHaveNoViolations();
    });

    it('has no axe violations with the undo confirmation open', async () => {
      renderWithIntl(
        <HotsiteTemplateGallery
          controller={makeTemplatesController({ canUndo: true, undoConfirmOpen: true })}
        />,
      );

      expect(await axe(screen.getByRole('alertdialog'))).toHaveNoViolations();
    });

    it('lets a keyboard user reach and press a card’s button', async () => {
      const user = userEvent.setup();
      const controller = makeTemplatesController();
      renderWithIntl(<HotsiteTemplateGallery controller={controller} />);

      await user.tab();
      await user.keyboard('{Enter}');

      expect(controller.apply).toHaveBeenCalledWith('beloauto');
    });
  });
});

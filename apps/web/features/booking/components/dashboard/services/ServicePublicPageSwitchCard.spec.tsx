// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { axe } from '@/axe-helper';
import { renderWithIntl } from '@/test-utils';
import { ServicePublicPageSwitchCard } from './ServicePublicPageSwitchCard';

function renderCard(
  props: Partial<Parameters<typeof ServicePublicPageSwitchCard>[0]> = {},
  onPublishedChange = vi.fn(),
) {
  return renderWithIntl(
    <ServicePublicPageSwitchCard
      published
      onPublishedChange={onPublishedChange}
      liveHref="/vitta/servicos/massagem"
      serviceActive
      {...props}
    />,
  );
}

describe('ServicePublicPageSwitchCard', () => {
  it('published: shows the "Publicada" chip and explains the "Ver detalhes" card', () => {
    renderCard();

    expect(screen.getByTestId('public-page-chip')).toHaveTextContent('Publicada');
    expect(screen.getByTestId('public-page-switch')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('public-page-switch')).toHaveTextContent('Ver detalhes');
  });

  it('unpublished: shows "Não publicada" and says the site card only says "Agendar"', () => {
    renderCard({ published: false, liveHref: null });

    expect(screen.getByTestId('public-page-chip')).toHaveTextContent('Não publicada');
    expect(screen.getByTestId('public-page-switch')).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByTestId('public-page-switch')).toHaveTextContent('mostra só “Agendar”');
  });

  it('reports the toggled value', async () => {
    const user = userEvent.setup();
    const onPublishedChange = vi.fn();
    renderCard({ published: true }, onPublishedChange);

    await user.click(screen.getByTestId('public-page-switch'));

    expect(onPublishedChange).toHaveBeenCalledWith(false);
  });

  it('opens the live page in a NEW browser tab, so the manager stays in the editor', () => {
    renderCard();

    const link = screen.getByTestId('public-page-view-link');
    expect(link).toHaveAttribute('href', '/vitta/servicos/massagem');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
    expect(link.getAttribute('rel')).toContain('noreferrer');
    expect(link).toHaveTextContent('(abre em uma nova aba)');
  });

  it('disables the link (no anchor at all) while the page is not live', () => {
    renderCard({ published: false, liveHref: null });

    expect(screen.queryByTestId('public-page-view-link')).not.toBeInTheDocument();
    expect(screen.getByTestId('public-page-view-link-disabled')).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('keeps the link disabled when the switch was just turned on but not saved yet (nothing live)', () => {
    renderCard({ published: true, liveHref: null });

    expect(screen.queryByTestId('public-page-view-link')).not.toBeInTheDocument();
  });

  it('notes that a deactivated service shows no page on the site', () => {
    renderCard({ serviceActive: false });

    expect(screen.getByTestId('public-page-inactive-note')).toHaveTextContent(
      'depois que ele for reativado',
    );
  });

  it('shows no deactivation note for an active service', () => {
    renderCard({ serviceActive: true });

    expect(screen.queryByTestId('public-page-inactive-note')).not.toBeInTheDocument();
  });

  it('has no accessibility violations', async () => {
    const { container } = renderCard();

    expect(await axe(container)).toHaveNoViolations();
  });
});
